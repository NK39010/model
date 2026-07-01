import { useEffect, useMemo, useState } from "react";
import { fileUrl, getJob } from "../../api/jobs";
import { FilePicker } from "../../shared/components/FilePicker";
import { HelpTip } from "../../shared/components/HelpTip";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { StatusMessage } from "../../shared/components/StatusMessage";
import { ToolHistoryMenu } from "../../shared/components/ToolHistoryMenu";
import type { JobRecord } from "../../shared/types/job";
import { addToolHistory, readToolHistory, type ToolHistoryItem } from "../../shared/utils/toolHistory";
import { runGgtree } from "./ggtreeApi";
import type { GgtreePayload, GgtreeResult } from "./ggtreeTypes";

const TOOL_NAME = "ggtree_visualization";
const EXAMPLE_NEWICK = "((Human:0.08,Mouse:0.10)95:0.04,Dog:0.15);";

interface GgtreePanelProps {
  initialNewick?: string;
}

export function GgtreePanel({ initialNewick = "" }: GgtreePanelProps) {
  const [payload, setPayload] = useState<GgtreePayload>({
    newick: normalizeNewick(initialNewick) || EXAMPLE_NEWICK,
    layout: "rectangular",
    show_tip_labels: true,
    show_support: true,
    show_branch_length: true,
    tip_font_size: 3,
    width: 11,
    height: 8
  });
  const [job, setJob] = useState<JobRecord<GgtreeResult> | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isInputOpen, setIsInputOpen] = useState(true);
  const [inputFile, setInputFile] = useState<{ name: string; size: number } | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<ToolHistoryItem<GgtreePayload>>>(() =>
    readToolHistory<GgtreePayload>(TOOL_NAME)
  );

  const treeSummary = useMemo(() => summarizeNewick(payload.newick), [payload.newick]);

  useEffect(() => {
    const nextNewick = normalizeNewick(initialNewick);
    if (nextNewick) {
      setPayload((current) => ({ ...current, newick: nextNewick }));
      setJob(null);
      setError("");
      setIsInputOpen(true);
    }
  }, [initialNewick]);

  const submit = async () => {
    if (!treeSummary.isTree) {
      setError("请输入有效的 Newick 树，例如：(A:0.1,B:0.2);");
      setIsInputOpen(true);
      return;
    }

    setIsRunning(true);
    setJob(null);
    setError("");
    try {
      const nextJob = await runGgtree(payload);
      setJob(nextJob);
      setHistoryItems(
        addToolHistory<GgtreePayload>(TOOL_NAME, {
          fileName: inputFile?.name ?? "tree.newick",
          summary: `${treeSummary.tipCount} tips · ${layoutLabel(payload.layout)}`,
          paramsSummary: `${payload.width} × ${payload.height} in · ${payload.tip_font_size} pt`,
          payload,
          jobId: nextJob.id,
          inputFileSize: inputFile?.size
        })
      );
      setIsInputOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ggtree 绘图失败。");
    } finally {
      setIsRunning(false);
    }
  };

  const restoreHistory = async (item: ToolHistoryItem<GgtreePayload>) => {
    setPayload(item.payload);
    setInputFile(item.inputFileSize === undefined ? null : { name: item.fileName, size: item.inputFileSize });
    setError("");
    if (!item.jobId) { setJob(null); setIsInputOpen(true); return; }
    setIsRunning(true);
    try {
      setJob(await getJob<GgtreeResult>(item.jobId));
      setIsInputOpen(false);
    } catch (caught) {
      setJob(null);
      setError(caught instanceof Error ? caught.message : "无法读取历史结果。");
      setIsInputOpen(true);
    } finally { setIsRunning(false); }
  };

  return (
    <section className={`tool-layout ${isInputOpen ? "" : "input-collapsed"}`}>
      <div className={`tool-editor collapsible-card ${isInputOpen ? "open" : "closed"}`}>
        <div className="collapsible-card-header">
          <button className="input-toggle-button" type="button" onClick={() => setIsInputOpen((value) => !value)} aria-expanded={isInputOpen}>
            <div className="input-card-title">
              <p className="eyebrow">R / ggtree</p>
              <h2>系统发育树绘图</h2>
            </div>
            {!isInputOpen ? (
              <span className="input-parameter-summary">
                {inputFile ? `${inputFile.name} · ` : ""}
                {treeSummary.tipCount} tips · {layoutLabel(payload.layout)}
              </span>
            ) : null}
            <span className="input-toggle-label">{isInputOpen ? "⌃" : "⌄"}</span>
          </button>
          <div className="header-actions">
            <ToolHistoryMenu items={historyItems} onRestore={restoreHistory} />
            <button className="header-run-action" disabled={isRunning} onClick={submit}>
              {isRunning ? "◌ RENDERING" : "▶ RENDER"}
            </button>
          </div>
        </div>

        <div className="collapsible-card-body">
          <div className="input-workspace">
            <div className="sequence-input-column">
              <FilePicker
                fileName={inputFile?.name}
                detail={inputFile ? `${treeSummary.tipCount} tips · ${(inputFile.size / 1024).toFixed(1)} KB` : "支持 .treefile / .nwk / .newick"}
                onFile={(file, text) => {
                  setInputFile({ name: file.name, size: file.size });
                  setPayload((current) => ({ ...current, newick: text }));
                  setError("");
                }}
              />
              <div className="input-source-summary">
                <strong>{treeSummary.isTree ? "有效 Newick" : "等待有效树文件"}</strong>
                <span>{treeSummary.tipCount} tips · {treeSummary.hasBranchLength ? "含枝长" : "无枝长"}</span>
              </div>
              <label className="field">
                <span>Newick 树 <HelpTip text="可以直接粘贴 IQ-TREE 的 result.treefile 内容，或上传 Newick 树文件。" /></span>
                <textarea
                  value={payload.newick}
                  onChange={(event) => setPayload({ ...payload, newick: event.target.value })}
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="input-controls-column">
              <div className="control-grid ggtree-control-grid">
                <label className="field">
                  <span>树形布局</span>
                  <select
                    value={payload.layout}
                    onChange={(event) => setPayload({ ...payload, layout: event.target.value as GgtreePayload["layout"] })}
                  >
                    <option value="rectangular">矩形树</option>
                    <option value="circular">圆形树</option>
                    <option value="fan">扇形树</option>
                  </select>
                </label>
                <label className="field">
                  <span>叶标签字号</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    step={0.5}
                    value={payload.tip_font_size}
                    onChange={(event) => setPayload({ ...payload, tip_font_size: Number(event.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>宽度（英寸）</span>
                  <input
                    type="number"
                    min={4}
                    max={30}
                    step={1}
                    value={payload.width}
                    onChange={(event) => setPayload({ ...payload, width: Number(event.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>高度（英寸）</span>
                  <input
                    type="number"
                    min={4}
                    max={40}
                    step={1}
                    value={payload.height}
                    onChange={(event) => setPayload({ ...payload, height: Number(event.target.value) })}
                  />
                </label>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={payload.show_tip_labels}
                    onChange={(event) => setPayload({ ...payload, show_tip_labels: event.target.checked })}
                  />
                  显示叶节点名称
                </label>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={payload.show_support}
                    onChange={(event) => setPayload({ ...payload, show_support: event.target.checked })}
                  />
                  显示节点支持度
                </label>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={payload.show_branch_length}
                    onChange={(event) => setPayload({ ...payload, show_branch_length: event.target.checked })}
                  />
                  按枝长缩放
                </label>
              </div>
              <div className="mode-note">
                <strong>{layoutLabel(payload.layout)}</strong>
                <span>调用独立的 R / ggtree 后端，生成 PNG、PDF，并在 svglite 可用时生成 SVG。</span>
              </div>
            </div>
          </div>
        </div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>

      <div className="tool-results">
        {isRunning ? (
          <StatusMessage>
            <strong>正在使用 R / ggtree 绘图</strong>
            <span>{treeSummary.tipCount} tips · {layoutLabel(payload.layout)}</span>
          </StatusMessage>
        ) : job?.result ? (
          <GgtreeResultView result={job.result} jobId={job.id} />
        ) : job ? (
          <StatusMessage tone={job.status === "failed" ? "error" : "info"}>
            <strong>{job.status === "failed" ? "ggtree 绘图失败" : "任务没有返回绘图结果"}</strong>
            <span>{formatJobError(job.error)}</span>
          </StatusMessage>
        ) : error ? (
          <StatusMessage tone="error">{error}</StatusMessage>
        ) : (
          <StatusMessage>上传 Newick 树或从 IQ-TREE 发送树结果后，这里会显示 ggtree 图像和下载文件。</StatusMessage>
        )}
      </div>
    </section>
  );
}

function GgtreeResultView({ result, jobId }: { result: GgtreeResult; jobId: string }) {
  return (
    <>
      <div className="summary-row iqtree-summary-row">
        <div><span>叶节点</span><strong>{result.tip_count}</strong></div>
        <div><span>布局</span><strong>{layoutLabel(result.layout)}</strong></div>
        <div><span>画布</span><strong>{result.width} × {result.height} in</strong></div>
        <div><span>标签字号</span><strong>{result.tip_font_size}</strong></div>
      </div>
      <section className="report-block">
        <div className="block-title-row">
          <h3>ggtree 绘图结果</h3>
          <span>R / Bioconductor</span>
        </div>
        <div className="ggtree-preview-viewport">
          <img src={fileUrl(jobId, result.files.png)} alt="R ggtree rendered phylogenetic tree" />
        </div>
      </section>
      <ResultFiles jobId={jobId} files={result.files} />
    </>
  );
}

function summarizeNewick(value: string): { isTree: boolean; tipCount: number; hasBranchLength: boolean } {
  const text = value.trim();
  const isTree = text.includes("(") && text.includes(")");
  return {
    isTree,
    tipCount: isTree ? text.replace(/;$/, "").split(",").length : 0,
    hasBranchLength: /:\s*\d/.test(text)
  };
}

function normalizeNewick(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function layoutLabel(layout: GgtreePayload["layout"]): string {
  if (layout === "circular") return "圆形树";
  if (layout === "fan") return "扇形树";
  return "矩形树";
}

function formatJobError(error: JobRecord<GgtreeResult>["error"]): string {
  if (!error) return "后端任务未返回错误详情。";
  if (typeof error === "string") return error;
  const message = error.message || error.code || "后端任务失败。";
  const details = error.details ? Object.entries(error.details) : [];
  if (details.length === 0) return message;
  return `${message} (${details.map(([key, value]) => `${key}: ${String(value)}`).join(" · ")})`;
}
