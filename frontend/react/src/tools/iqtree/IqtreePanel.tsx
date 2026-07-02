import { useEffect, useMemo, useState } from "react";
import { FilePicker } from "../../shared/components/FilePicker";
import { HelpTip } from "../../shared/components/HelpTip";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { cancelJob, getJob, getJobInput } from "../../api/jobs";
import { StatusMessage } from "../../shared/components/StatusMessage";
import { ToolHistoryMenu } from "../../shared/components/ToolHistoryMenu";
import { ToolRunStatus } from "../../shared/components/ToolRunStatus";
import { useRunTimer } from "../../shared/hooks/useRunTimer";
import type { JobRecord } from "../../shared/types/job";
import { parseFasta } from "../../shared/utils/fasta";
import { addToolHistory, readToolHistory, type ToolHistoryItem } from "../../shared/utils/toolHistory";
import { runIqtree } from "./iqtreeApi";
import type { IqtreePayload, IqtreeResult } from "./iqtreeTypes";
import { PhylogeneticTreePreview } from "../../shared/components/PhylogeneticTreePreview";

const TOOL_NAME = "iqtree_phylogeny";

const EXAMPLE_ALIGNED = `>Human
ATGCTAGCTAGCTACGATCG
>Mouse
ATGCTAGATAGCTACGATCG
>Dog
ATGCTAGCTAG-TACGATCG`;

const DNA_MODELS = ["GTR+G", "GTR+I+G", "HKY+G", "JC", "K2P"];
const PROTEIN_MODELS = ["LG+G", "WAG+G", "JTT+G", "VT+G"];

const SEQUENCE_TYPE_LABEL: Record<IqtreePayload["sequence_type"], string> = {
  auto: "自动",
  dna: "DNA",
  rna: "RNA",
  protein: "蛋白质"
};

interface IqtreePanelProps {
  initialFasta?: string;
  onVisualizeTree?: (newick: string) => void;
  onRunningChange?: (running: boolean) => void;
}

export function IqtreePanel({ initialFasta = "", onVisualizeTree, onRunningChange }: IqtreePanelProps) {
  const [payload, setPayload] = useState<IqtreePayload>({
    aligned_fasta: normalizeFastaInput(initialFasta) || EXAMPLE_ALIGNED,
    sequence_type: "auto",
    strict: false,
    model_mode: "auto",
    model: "GTR+G",
    bootstrap_enabled: true,
    bootstrap_replicates: 1000,
    alrt_enabled: true,
    alrt_replicates: 1000,
    thread_mode: "auto",
    thread_count: 4
  });
  const [job, setJob] = useState<JobRecord<IqtreeResult> | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const { elapsedSeconds, startTimer } = useRunTimer(isRunning);
  const [isInputOpen, setIsInputOpen] = useState(true);
  const [inputFile, setInputFile] = useState<{ name: string; size: number } | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<ToolHistoryItem<IqtreePayload>>>(() =>
    readToolHistory<IqtreePayload>(TOOL_NAME)
  );

  const detectedSummary = useMemo(() => summarizeAlignment(payload.aligned_fasta), [payload.aligned_fasta]);
  const modelOptions = payload.sequence_type === "protein" ? PROTEIN_MODELS : DNA_MODELS;
  const selectedModel = modelOptions.includes(payload.model) ? payload.model : modelOptions[0];

  useEffect(() => {
    const nextInitialFasta = normalizeFastaInput(initialFasta);
    if (nextInitialFasta) {
      setPayload((current) => ({ ...current, aligned_fasta: nextInitialFasta }));
    }
  }, [initialFasta]);
  useEffect(() => onRunningChange?.(isRunning), [isRunning, onRunningChange]);

  useEffect(() => {
    if (payload.model_mode === "fixed" && payload.model !== selectedModel) {
      setPayload((current) => ({ ...current, model: selectedModel }));
    }
  }, [payload.model, payload.model_mode, selectedModel]);

  const submit = async () => {
    const records = parseFasta(payload.aligned_fasta);
    const lengths = new Set(records.map((record) => record.sequence.length));
    if (records.length < 3 || lengths.size !== 1) {
      setError("IQ-TREE 需要至少三条长度一致的已比对序列。");
      setIsInputOpen(true);
      return;
    }
    setIsRunning(true);
    setIsInputOpen(false);
    startTimer();
    setJob(null);
    setError("");
    try {
      const nextPayload = { ...payload, model: selectedModel };
      const nextJob = await runIqtree(nextPayload, { onStarted: setJob, onUpdate: setJob });
      setJob(nextJob);
      setHistoryItems(
        addToolHistory<IqtreePayload>(TOOL_NAME, {
          fileName: inputFile?.name ?? "aligned.fasta",
          summary: `${records.length} 条序列 · ${records[0]?.sequence.length ?? 0} columns`,
          paramsSummary: `${payload.model_mode === "auto" ? "MFP" : selectedModel} · ${payload.thread_mode === "auto" ? "AUTO" : `${payload.thread_count} threads`}`,
          payload: nextPayload,
          jobId: nextJob.id,
          inputFileSize: inputFile?.size
        })
      );
      setIsInputOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "IQ-TREE 建树失败。");
    } finally {
      setIsRunning(false);
    }
  };

  const stop = async () => { if (job) { setJob(await cancelJob<IqtreeResult>(job.id)); setIsRunning(false); } };

  const restoreHistory = async (item: ToolHistoryItem<IqtreePayload>) => {
    setInputFile(item.inputFileSize === undefined ? null : { name: item.fileName, size: item.inputFileSize });
    setError("");
    if (!item.jobId) { if (item.payload) setPayload(item.payload); setJob(null); setIsInputOpen(true); return; }
    setIsRunning(true);
    try {
      const [restoredJob, restoredPayload] = await Promise.all([
        getJob<IqtreeResult>(item.jobId),
        item.payload ? Promise.resolve(item.payload) : getJobInput<IqtreePayload>(item.jobId)
      ]);
      setPayload(restoredPayload);
      setJob(restoredJob);
      setIsInputOpen(false);
    } catch (caught) {
      setJob(null);
      if (item.payload) {
        setPayload(item.payload);
        setError("历史结果文件不在当前后端环境中，已恢复输入参数；需要重新运行以生成结果。");
      } else {
        setError(caught instanceof Error ? caught.message : "无法读取历史结果。");
      }
      setIsInputOpen(true);
    } finally { setIsRunning(false); }
  };

  return (
    <section className={`tool-layout ${isInputOpen ? "" : "input-collapsed"}`}>
      <div className={`tool-editor collapsible-card ${isInputOpen ? "open" : "closed"}`}>
        <div className="collapsible-card-header">
          <button className="input-toggle-button" type="button" onClick={() => setIsInputOpen((value) => !value)} aria-expanded={isInputOpen}>
            <div className="input-card-title">
              <p className="eyebrow">IQ-TREE</p>
              <h2>Input</h2>
            </div>
            {!isInputOpen ? (
              <span className="input-parameter-summary">
                {inputFile ? `${inputFile.name} · ` : ""}
                {detectedSummary.sequenceCount} 条序列 · {detectedSummary.alignmentLength} columns · {payload.model_mode === "auto" ? "MFP" : selectedModel}
              </span>
            ) : null}
            <span className="input-toggle-label">{isInputOpen ? "⌃" : "⌄"}</span>
          </button>
          <div className="header-actions">
            <ToolHistoryMenu items={historyItems} onRestore={restoreHistory} />
            <button className="header-run-action" disabled={isRunning} onClick={submit}>{isRunning ? "◌ RUNNING" : "▶ RUN"}</button>
          </div>
        </div>

        <div className="collapsible-card-body">
          <div className="input-workspace">
            <div className="sequence-input-column">
              <FilePicker
                fileName={inputFile?.name}
                detail={inputFile ? `${detectedSummary.sequenceCount} 条序列 · ${detectedSummary.alignmentLength} columns · ${(inputFile.size / 1024).toFixed(1)} KB` : "输入必须是已比对 FASTA"}
                onFile={(file, text) => { setInputFile({ name: file.name, size: file.size }); setPayload({ ...payload, aligned_fasta: text }); setError(""); }}
              />
              <div className="input-source-summary">
                <strong>{detectedSummary.isAligned ? "已比对 FASTA" : "等待有效 alignment"}</strong>
                <span>{detectedSummary.sequenceCount} 条序列 · {detectedSummary.alignmentLength} columns · {SEQUENCE_TYPE_LABEL[payload.sequence_type]}</span>
              </div>
              <label className="field">
                <span>已比对 FASTA <HelpTip text="IQ-TREE 输入必须是 alignment：至少三条序列，且所有序列长度一致。未比对序列请先运行 MAFFT。" /></span>
                <textarea value={payload.aligned_fasta} onChange={(event) => setPayload({ ...payload, aligned_fasta: event.target.value })} spellCheck={false} />
              </label>
            </div>
            <div className="input-controls-column">
              <div className="control-grid iqtree-control-grid">
                <label className="field">
                  <span>数据类型</span>
                  <select
                    value={payload.sequence_type}
                    onChange={(event) => setPayload({ ...payload, sequence_type: event.target.value as IqtreePayload["sequence_type"] })}
                  >
                    <option value="auto">自动</option>
                    <option value="dna">DNA</option>
                    <option value="rna">RNA</option>
                    <option value="protein">蛋白质</option>
                  </select>
                </label>
                <label className="field">
                  <span>模型模式 <HelpTip text="自动模式使用 IQ-TREE ModelFinder；指定模型会直接传入对应模型字符串。" /></span>
                  <select
                    value={payload.model_mode}
                    onChange={(event) => setPayload({ ...payload, model_mode: event.target.value as IqtreePayload["model_mode"] })}
                  >
                    <option value="auto">自动选择模型 MFP</option>
                    <option value="fixed">指定模型</option>
                  </select>
                </label>
                {payload.model_mode === "fixed" ? (
                  <label className="field">
                    <span>模型</span>
                    <select value={selectedModel} onChange={(event) => setPayload({ ...payload, model: event.target.value })}>
                      {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={payload.bootstrap_enabled}
                    onChange={(event) => setPayload({ ...payload, bootstrap_enabled: event.target.checked })}
                  />
                  Ultrafast bootstrap
                </label>
                {payload.bootstrap_enabled ? (
                  <label className="field">
                    <span>Bootstrap replicates</span>
                    <input type="number" min={100} max={10000} step={100} value={payload.bootstrap_replicates} onChange={(event) => setPayload({ ...payload, bootstrap_replicates: Number(event.target.value) })} />
                  </label>
                ) : null}
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={payload.alrt_enabled}
                    onChange={(event) => setPayload({ ...payload, alrt_enabled: event.target.checked })}
                  />
                  SH-aLRT
                </label>
                {payload.alrt_enabled ? (
                  <label className="field">
                    <span>SH-aLRT replicates</span>
                    <input type="number" min={100} max={10000} step={100} value={payload.alrt_replicates} onChange={(event) => setPayload({ ...payload, alrt_replicates: Number(event.target.value) })} />
                  </label>
                ) : null}
                <label className="field">
                  <span>线程</span>
                  <select
                    value={payload.thread_mode === "auto" ? "auto" : String(payload.thread_count)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPayload(value === "auto" ? { ...payload, thread_mode: "auto" } : { ...payload, thread_mode: "fixed", thread_count: Number(value) });
                    }}
                  >
                    <option value="auto">Auto</option>
                    {[1, 2, 4, 8, 16, 32].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
              </div>
              <button className="compact-action iqtree-advanced-toggle" type="button" onClick={() => setIsAdvancedOpen((value) => !value)}>
                {isAdvancedOpen ? "收起高级选项" : "高级选项"}
              </button>
              {isAdvancedOpen ? (
                <div className="control-grid iqtree-control-grid">
                  <label className="field">
                    <span>Random seed</span>
                    <input
                      type="number"
                      min={1}
                      value={payload.random_seed ?? ""}
                      onChange={(event) => setPayload({ ...payload, random_seed: event.target.value ? Number(event.target.value) : undefined })}
                    />
                  </label>
                  <label className="toggle-field">
                    <input type="checkbox" checked={payload.strict} onChange={(event) => setPayload({ ...payload, strict: event.target.checked })} />
                    严格字符校验
                  </label>
                </div>
              ) : null}
              <div className="mode-note">
                <strong>{payload.model_mode === "auto" ? "ModelFinder" : selectedModel}</strong>
                <span>运行时会调用真实 IQ-TREE 可执行文件；未安装时后端会提示设置 IQTREE_BINARY。</span>
              </div>
            </div>
          </div>
        </div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>

      <div className="tool-results">
        {isRunning ? (
          <ToolRunStatus title="正在构建系统发育树" description="IQ-TREE 正在选择模型并推断树，完成后自动显示树预览。" elapsedSeconds={elapsedSeconds} stage={payload.model_mode === "auto" ? "ModelFinder / 树搜索 / 支持度计算" : "树搜索与支持度计算"} onCancel={job ? stop : undefined} metrics={[{ label: "输入序列", value: detectedSummary.sequenceCount }, { label: "比对长度", value: detectedSummary.alignmentLength }, { label: "模型", value: payload.model_mode === "auto" ? "MFP" : selectedModel }, { label: "线程", value: payload.thread_mode === "auto" ? "AUTO" : payload.thread_count }]} />
        ) : job?.result ? (
          <IqtreeResultView result={job.result} jobId={job.id} onVisualizeTree={onVisualizeTree} />
        ) : job ? (
          <IqtreeEmptyResultView job={job} />
        ) : error ? (
          <StatusMessage tone="error">
            <strong>建树没有完成</strong>
            <span>{error}</span>
          </StatusMessage>
        ) : (
          <StatusMessage>提交已比对 FASTA 后，这里会显示 Newick、树预览、模型报告和下载文件。</StatusMessage>
        )}
      </div>
    </section>
  );
}

function IqtreeEmptyResultView({ job }: { job: JobRecord<IqtreeResult> }) {
  const isFailed = job.status === "failed";
  const errorMessage = formatJobError(job.error);
  return (
    <StatusMessage tone={isFailed ? "error" : "info"}>
      <strong>{isFailed ? "IQ-TREE 运行失败" : "任务已返回，但没有树结果"}</strong>
      <span>{errorMessage || `Job ${job.id} 当前状态：${job.status}`}</span>
    </StatusMessage>
  );
}

function IqtreeResultView({
  result,
  jobId,
  onVisualizeTree
}: {
  result: IqtreeResult;
  jobId: string;
  onVisualizeTree?: (newick: string) => void;
}) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <>
      <div className="summary-row iqtree-summary-row">
        <div><span>序列数</span><strong>{result.sequence_count}</strong></div>
        <div><span>比对长度</span><strong>{result.alignment_length}</strong></div>
        <div><span>最佳模型</span><strong>{result.best_model ?? result.iqtree_model}</strong></div>
        <div><span>线程 / LogL</span><strong>{result.thread_count} · {result.log_likelihood === null ? "-" : result.log_likelihood.toFixed(2)}</strong></div>
      </div>
      <section className="report-block">
        <div className="block-title-row">
          <h3>树预览</h3>
          <div className="block-title-actions">
            <span>{result.tree_summary.tip_count} tips · {result.tree_summary.has_support_values ? "含支持度" : "无支持度"}</span>
            {onVisualizeTree ? (
              <button className="compact-action" type="button" onClick={() => onVisualizeTree(result.newick)}>
                用 ggtree 绘图
              </button>
            ) : null}
          </div>
        </div>
        <PhylogeneticTreePreview newick={result.newick} />
      </section>
      <ResultFiles jobId={jobId} files={result.files} />
      <section className="report-block iqtree-advanced-result">
        <button
          className="iqtree-result-disclosure"
          type="button"
          onClick={() => setIsAdvancedOpen((value) => !value)}
          aria-expanded={isAdvancedOpen}
        >
          <span>{isAdvancedOpen ? "收起高级信息" : "高级信息 / 复现参数"}</span>
          <strong>{result.iqtree_model} · {result.iqtree_binary_source}</strong>
        </button>
        {isAdvancedOpen ? (
          <div className="iqtree-advanced-result-body">
            <section>
              <div className="block-title-row">
                <h3>Newick</h3>
                <span>树文件文本格式</span>
              </div>
              <pre className="sequence-preview iqtree-newick-preview">{result.newick}</pre>
            </section>
            <section>
              <div className="block-title-row">
                <h3>运行命令</h3>
                <span>用于复现和排错</span>
              </div>
              <pre className="command-preview">{result.command.join(" ")}</pre>
            </section>
          </div>
        ) : null}
      </section>
    </>
  );
}

function summarizeAlignment(fasta: string): { sequenceCount: number; alignmentLength: number; isAligned: boolean } {
  const records = parseFasta(fasta);
  const lengths = new Set(records.map((record) => record.sequence.length));
  return {
    sequenceCount: records.length,
    alignmentLength: records[0]?.sequence.length ?? 0,
    isAligned: records.length >= 3 && lengths.size === 1
  };
}

function normalizeFastaInput(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatJobError(error: JobRecord<IqtreeResult>["error"]): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const message = error.message || error.code || "后端任务失败。";
  const details = error.details ? Object.entries(error.details) : [];
  if (details.length === 0) return message;
  const detailsText = details
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
  return `${message} (${detailsText})`;
}
