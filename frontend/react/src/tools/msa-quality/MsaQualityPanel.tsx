import { useEffect, useState } from "react";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { cancelJob, getJob, getJobInput } from "../../api/jobs";
import { FilePicker } from "../../shared/components/FilePicker";
import { HelpTip } from "../../shared/components/HelpTip";
import { StatusMessage } from "../../shared/components/StatusMessage";
import { ToolHistoryMenu } from "../../shared/components/ToolHistoryMenu";
import { ToolRunStatus } from "../../shared/components/ToolRunStatus";
import { useRunTimer } from "../../shared/hooks/useRunTimer";
import type { JobRecord } from "../../shared/types/job";
import { parseFasta } from "../../shared/utils/fasta";
import { addToolHistory, readToolHistory, type ToolHistoryItem } from "../../shared/utils/toolHistory";
import { MsaQualityReport } from "./MsaQualityReport";
import { runMsaQuality } from "./msaQualityApi";
import type { MsaQualityPayload, MsaQualityResult } from "./msaQualityTypes";

const EXAMPLE_ALIGNED = `>Human
ATGCTAGCTAGCTACGATCG
>Mouse
ATGCTAGATAGCTACGATCG
>Dog
ATGCTAGCTAG-TACGATCG`;

const SEQUENCE_TYPE_LABEL: Record<MsaQualityPayload["sequence_type"], string> = {
  auto: "自动",
  dna: "DNA",
  rna: "RNA",
  protein: "蛋白质"
};

const MSA_QUALITY_TOOL_NAME = "MSA_quality";

interface MsaQualityPanelProps {
  initialFasta?: string;
  onTrimAlignment?: (alignedFasta: string) => void;
  onBmgeAlignment?: (alignedFasta: string) => void;
  onBuildTree?: (alignedFasta: string) => void;
  onRunningChange?: (running: boolean) => void;
}

export function MsaQualityPanel({ initialFasta = "", onTrimAlignment, onBmgeAlignment, onBuildTree, onRunningChange }: MsaQualityPanelProps) {
  const [payload, setPayload] = useState<MsaQualityPayload>({
    aligned_fasta: initialFasta || EXAMPLE_ALIGNED,
    sequence_type: "auto",
    strict: false,
    majority_threshold: 0.6,
    gap_consensus_threshold: 0.5,
    high_gap_threshold: 0.7,
    low_conservation_threshold: 0.5,
    high_entropy_threshold: 1.5
  });
  const [job, setJob] = useState<JobRecord<MsaQualityResult> | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const { elapsedSeconds, startTimer } = useRunTimer(isRunning);
  const [isInputOpen, setIsInputOpen] = useState(true);
  const [inputFile, setInputFile] = useState<{ name: string; size: number } | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<ToolHistoryItem<MsaQualityPayload>>>(() =>
    readToolHistory<MsaQualityPayload>(MSA_QUALITY_TOOL_NAME)
  );

  useEffect(() => {
    if (initialFasta) {
      setPayload((current) => ({ ...current, aligned_fasta: initialFasta }));
    }
  }, [initialFasta]);
  useEffect(() => onRunningChange?.(isRunning), [isRunning, onRunningChange]);

  const submit = async () => {
    const records = parseFasta(payload.aligned_fasta);
    if (records.length < 2 || new Set(records.map((record) => record.sequence.length)).size !== 1) {
      setError("MSA Quality 需要至少两条长度一致的已比对序列。");
      setIsInputOpen(true);
      return;
    }
    startTimer();
    setIsRunning(true);
    setIsInputOpen(false);
    setError("");
    try {
      const nextJob = await runMsaQuality(payload, { onStarted: setJob, onUpdate: setJob });
      setJob(nextJob);
      setHistoryItems(
        addToolHistory<MsaQualityPayload>(MSA_QUALITY_TOOL_NAME, {
          fileName: inputFile?.name ?? "aligned.fasta",
          summary: `${records.length} 条序列`,
          paramsSummary: `${SEQUENCE_TYPE_LABEL[payload.sequence_type]} · GAP ${payload.high_gap_threshold.toFixed(2)} · 保守性 ${payload.low_conservation_threshold.toFixed(2)}`,
          payload,
          jobId: nextJob.id,
          inputFileSize: inputFile?.size
        })
      );
      setIsInputOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "MSA_quality 运行失败。");
    } finally {
      setIsRunning(false);
    }
  };

  const stop = async () => { if (job) { setJob(await cancelJob<MsaQualityResult>(job.id)); setIsRunning(false); } };

  const restoreHistory = async (item: ToolHistoryItem<MsaQualityPayload>) => {
    setInputFile(item.inputFileSize === undefined ? null : { name: item.fileName, size: item.inputFileSize });
    setError("");
    if (!item.jobId) { if (item.payload) setPayload(item.payload); setJob(null); setIsInputOpen(true); return; }
    setIsRunning(true);
    try {
      const [restoredJob, restoredPayload] = await Promise.all([
        getJob<MsaQualityResult>(item.jobId),
        item.payload ? Promise.resolve(item.payload) : getJobInput<MsaQualityPayload>(item.jobId)
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
    <section className={`tool-layout msa-layout ${isInputOpen ? "" : "input-collapsed"}`}>
      <div className={`tool-editor msa-editor collapsible-card ${isInputOpen ? "open" : "closed"}`}>
        <div className="collapsible-card-header">
          <button className="input-toggle-button" type="button" onClick={() => setIsInputOpen((value) => !value)} aria-expanded={isInputOpen}>
            <div className="input-card-title">
            <p className="eyebrow">MSA_quality</p>
            <h2>Input</h2>
            </div>
            {!isInputOpen ? <span className="input-parameter-summary">{inputFile ? `${inputFile.name} · ${parseFasta(payload.aligned_fasta).length} 条序列 · ` : ""}{SEQUENCE_TYPE_LABEL[payload.sequence_type]} · GAP {payload.high_gap_threshold.toFixed(2)} · 保守性 {payload.low_conservation_threshold.toFixed(2)}</span> : null}
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
            <FilePicker fileName={inputFile?.name} detail={inputFile ? `${parseFasta(payload.aligned_fasta).length} 条序列 · ${(inputFile.size / 1024).toFixed(1)} KB` : "所有序列必须已经比对且长度一致"} onFile={(file, text) => { setInputFile({ name: file.name, size: file.size }); setPayload({ ...payload, aligned_fasta: text }); setError(""); }} />
            <label className="field">
            <span>已比对 FASTA <HelpTip text="输入必须是已经完成多序列比对的 FASTA，所有序列的含 GAP 长度必须一致。" /></span>
            <textarea
              value={payload.aligned_fasta}
              onChange={(event) => setPayload({ ...payload, aligned_fasta: event.target.value })}
              spellCheck={false}
            />
            </label>
          </div>
          <div className="input-controls-column"><div className="control-grid">
            <label className="field">
              <span>序列类型 <HelpTip text="决定字符校验、共识序列计算和序列速览中的残基配色。" /></span>
              <select
                value={payload.sequence_type}
                onChange={(event) =>
                  setPayload({ ...payload, sequence_type: event.target.value as MsaQualityPayload["sequence_type"] })
                }
              >
                <option value="auto">自动</option>
                <option value="dna">DNA</option>
                <option value="rna">RNA</option>
                <option value="protein">蛋白质</option>
              </select>
            </label>
            <label className="field">
              <span>高 GAP 比例阈值 <HelpTip text="某个比对列的 GAP 比例达到该值时，标记为高 GAP 比对列。" /></span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={payload.high_gap_threshold}
                onChange={(event) => setPayload({ ...payload, high_gap_threshold: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>低保守性阈值 <HelpTip text="比对位点的保守性低于该值时，标记为低保守性位点。" /></span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={payload.low_conservation_threshold}
                onChange={(event) => setPayload({ ...payload, low_conservation_threshold: Number(event.target.value) })}
              />
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={payload.strict}
                onChange={(event) => setPayload({ ...payload, strict: event.target.checked })}
              />
              严格字符校验 <HelpTip text="检查每个残基是否符合所选序列类型，并报告无效字符。" />
            </label>
          </div>
          </div></div>
        </div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>

      <div className="msa-report-shell">
        {isRunning ? (
          <ToolRunStatus title="正在评估比对质量" description="正在计算位点质量、序列相似度与问题区域。" elapsedSeconds={elapsedSeconds} stage="生成质量指标与报告" onCancel={job ? stop : undefined} metrics={[{ label: "输入序列", value: parseFasta(payload.aligned_fasta).length }, { label: "比对长度", value: parseFasta(payload.aligned_fasta)[0]?.sequence.length ?? 0 }, { label: "类型", value: SEQUENCE_TYPE_LABEL[payload.sequence_type] }]} />
        ) : job?.result ? (
          <>
            <MsaQualityReport result={job.result} />
            {onTrimAlignment || onBmgeAlignment || onBuildTree ? (
              <div className="action-row msa-workflow-actions">
                {onTrimAlignment ? (
                  <button className="secondary-action" type="button" onClick={() => onTrimAlignment(payload.aligned_fasta)}>
                    用 trimAl 修剪当前比对
                  </button>
                ) : null}
                {onBmgeAlignment ? (
                  <button className="secondary-action" type="button" onClick={() => onBmgeAlignment(payload.aligned_fasta)}>
                    用 BMGE 筛选当前比对
                  </button>
                ) : null}
                {onBuildTree ? (
                  <button className="secondary-action" type="button" onClick={() => onBuildTree(payload.aligned_fasta)}>
                    用 IQ-TREE 建树
                  </button>
                ) : null}
              </div>
            ) : null}
            <ResultFiles jobId={job.id} files={job.result.files} />
          </>
        ) : (
          <StatusMessage>提交已比对 FASTA 后，这里会生成 FastQC 风格的质量报告。</StatusMessage>
        )}
      </div>
    </section>
  );
}
