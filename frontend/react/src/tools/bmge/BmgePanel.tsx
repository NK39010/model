import { useEffect, useState } from "react";
import { FilePicker } from "../../shared/components/FilePicker";
import { HelpTip } from "../../shared/components/HelpTip";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { cancelJob, getJob, getJobInput } from "../../api/jobs";
import { StatusMessage } from "../../shared/components/StatusMessage";
import { ToolHistoryMenu } from "../../shared/components/ToolHistoryMenu";
import { ToolRunStatus } from "../../shared/components/ToolRunStatus";
import { useRunTimer } from "../../shared/hooks/useRunTimer";
import type { JobRecord } from "../../shared/types/job";
import { parseFasta, recordsToFasta } from "../../shared/utils/fasta";
import { addToolHistory, readToolHistory, type ToolHistoryItem } from "../../shared/utils/toolHistory";
import { runBmge } from "./bmgeApi";
import type { BmgePayload, BmgeResult } from "./bmgeTypes";

const TOOL_NAME = "BMGE";

const EXAMPLE_ALIGNED = `>Human
ATGCTAGCTAGCTACGATCG
>Mouse
ATGCTAGATAGCTACGATCG
>Dog
ATGCTAGCTAG-TACGATCG`;

const SEQUENCE_TYPE_LABEL: Record<BmgePayload["sequence_type"], string> = {
  auto: "自动",
  dna: "DNA",
  rna: "RNA",
  protein: "蛋白质"
};

interface BmgePanelProps {
  initialFasta?: string;
  onAnalyzeTrimmed: (trimmedFasta: string) => void;
  onBuildTree?: (trimmedFasta: string) => void;
  onRunningChange?: (running: boolean) => void;
}

export function BmgePanel({ initialFasta = "", onAnalyzeTrimmed, onBuildTree, onRunningChange }: BmgePanelProps) {
  const [payload, setPayload] = useState<BmgePayload>({
    aligned_fasta: initialFasta || EXAMPLE_ALIGNED,
    sequence_type: "auto",
    strict: false,
    entropy_threshold: 0.55,
    gap_rate_cutoff: 0.5
  });
  const [job, setJob] = useState<JobRecord<BmgeResult> | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const { elapsedSeconds, startTimer } = useRunTimer(isRunning);
  const [isInputOpen, setIsInputOpen] = useState(true);
  const [inputFile, setInputFile] = useState<{ name: string; size: number } | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<ToolHistoryItem<BmgePayload>>>(() =>
    readToolHistory<BmgePayload>(TOOL_NAME)
  );

  useEffect(() => {
    if (initialFasta) {
      setPayload((current) => ({ ...current, aligned_fasta: initialFasta }));
    }
  }, [initialFasta]);
  useEffect(() => onRunningChange?.(isRunning), [isRunning, onRunningChange]);

  const submit = async () => {
    startTimer();
    const records = parseFasta(payload.aligned_fasta);
    if (records.length < 2 || new Set(records.map((record) => record.sequence.length)).size !== 1) {
      setError("BMGE 需要至少两条长度一致的已比对序列。");
      setIsInputOpen(true);
      return;
    }
    setIsRunning(true);
    setIsInputOpen(false);
    setError("");
    try {
      const nextJob = await runBmge(payload, { onStarted: setJob, onUpdate: setJob });
      setJob(nextJob);
      setHistoryItems(
        addToolHistory<BmgePayload>(TOOL_NAME, {
          fileName: inputFile?.name ?? "aligned.fasta",
          summary: `${records.length} 条序列`,
          paramsSummary: `熵 ${payload.entropy_threshold.toFixed(2)} · GAP ${payload.gap_rate_cutoff.toFixed(2)}`,
          payload,
          jobId: nextJob.id,
          inputFileSize: inputFile?.size
        })
      );
      setIsInputOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BMGE 筛选失败。");
    } finally {
      setIsRunning(false);
    }
  };

  const stop = async () => { if (job) { setJob(await cancelJob<BmgeResult>(job.id)); setIsRunning(false); } };

  const restoreHistory = async (item: ToolHistoryItem<BmgePayload>) => {
    setInputFile(item.inputFileSize === undefined ? null : { name: item.fileName, size: item.inputFileSize });
    setError("");
    if (!item.jobId) { if (item.payload) setPayload(item.payload); setJob(null); setIsInputOpen(true); return; }
    setIsRunning(true);
    try {
      const [restoredJob, restoredPayload] = await Promise.all([
        getJob<BmgeResult>(item.jobId),
        item.payload ? Promise.resolve(item.payload) : getJobInput<BmgePayload>(item.jobId)
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

  const trimmedFasta = job?.result ? recordsToFasta(job.result.trimmed_records) : "";

  return (
    <section className={`tool-layout ${isInputOpen ? "" : "input-collapsed"}`}>
      <div className={`tool-editor collapsible-card ${isInputOpen ? "open" : "closed"}`}>
        <div className="collapsible-card-header">
          <button className="input-toggle-button" type="button" onClick={() => setIsInputOpen((value) => !value)} aria-expanded={isInputOpen}>
            <div className="input-card-title">
              <p className="eyebrow">BMGE</p>
              <h2>Input</h2>
            </div>
            {!isInputOpen ? (
              <span className="input-parameter-summary">
                {inputFile ? `${inputFile.name} · ${parseFasta(payload.aligned_fasta).length} 条序列 · ` : ""}
                熵 {payload.entropy_threshold.toFixed(2)} · GAP {payload.gap_rate_cutoff.toFixed(2)} · {SEQUENCE_TYPE_LABEL[payload.sequence_type]}
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
                detail={inputFile ? `${parseFasta(payload.aligned_fasta).length} 条序列 · ${(inputFile.size / 1024).toFixed(1)} KB` : "输入必须是已比对 FASTA"}
                onFile={(file, text) => { setInputFile({ name: file.name, size: file.size }); setPayload({ ...payload, aligned_fasta: text }); setError(""); }}
              />
              <label className="field">
                <span>已比对 FASTA <HelpTip text="BMGE 根据比对列的 GAP 比例和熵筛选位点，因此输入必须是已完成多序列比对且所有序列等长的 FASTA。" /></span>
                <textarea value={payload.aligned_fasta} onChange={(event) => setPayload({ ...payload, aligned_fasta: event.target.value })} spellCheck={false} />
              </label>
            </div>
            <div className="input-controls-column">
              <div className="control-grid">
                <label className="field">
                  <span>序列类型</span>
                  <select
                    value={payload.sequence_type}
                    onChange={(event) => setPayload({ ...payload, sequence_type: event.target.value as BmgePayload["sequence_type"] })}
                  >
                    <option value="auto">自动</option>
                    <option value="dna">DNA</option>
                    <option value="rna">RNA</option>
                    <option value="protein">蛋白质</option>
                  </select>
                </label>
                <label className="field">
                  <span>最大标准化熵 <HelpTip text="某列字符组成越分散，标准化熵越高；高于该值的列会被删除。" /></span>
                  <input type="number" min={0} max={1} step={0.05} value={payload.entropy_threshold} onChange={(event) => setPayload({ ...payload, entropy_threshold: Number(event.target.value) })} />
                </label>
                <label className="field">
                  <span>最大 GAP 比例 <HelpTip text="某列 GAP 比例高于该值时会被删除。" /></span>
                  <input type="number" min={0} max={1} step={0.05} value={payload.gap_rate_cutoff} onChange={(event) => setPayload({ ...payload, gap_rate_cutoff: Number(event.target.value) })} />
                </label>
                <label className="toggle-field">
                  <input type="checkbox" checked={payload.strict} onChange={(event) => setPayload({ ...payload, strict: event.target.checked })} />
                  严格字符校验
                </label>
              </div>
              <div className="mode-note">
                <strong>BMGE entropy filter</strong>
                <span>保留低缺口、低熵的比对列，适合系统发育分析前筛掉噪声区域。</span>
              </div>
            </div>
          </div>
        </div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>

      <div className="tool-results">
        {isRunning ? (
          <ToolRunStatus title="正在进行熵筛选" description="BMGE 正在按熵与缺口阈值筛选比对列。" elapsedSeconds={elapsedSeconds} stage="计算列熵并生成修剪结果" onCancel={job ? stop : undefined} metrics={[{ label: "输入序列", value: parseFasta(payload.aligned_fasta).length }, { label: "熵阈值", value: payload.entropy_threshold.toFixed(2) }, { label: "GAP 阈值", value: payload.gap_rate_cutoff.toFixed(2) }]} />
        ) : job?.result ? (
          <BmgeResultView result={job.result} jobId={job.id} trimmedFasta={trimmedFasta} onAnalyzeTrimmed={onAnalyzeTrimmed} onBuildTree={onBuildTree} />
        ) : (
          <StatusMessage>提交已比对 FASTA 后，这里会显示熵筛选前后对比、删除区间和 trimmed FASTA。</StatusMessage>
        )}
      </div>
    </section>
  );
}

function BmgeResultView({ result, jobId, trimmedFasta, onAnalyzeTrimmed, onBuildTree }: { result: BmgeResult; jobId: string; trimmedFasta: string; onAnalyzeTrimmed: (trimmedFasta: string) => void; onBuildTree?: (trimmedFasta: string) => void }) {
  return (
    <>
      <div className="summary-row trimming-summary-row">
        <div><span>原始长度</span><strong>{result.original_length}</strong></div>
        <div><span>筛选后长度</span><strong>{result.trimmed_length}</strong></div>
        <div><span>保留比例</span><strong>{(result.retained_fraction * 100).toFixed(1)}%</strong></div>
        <div><span>删除列数</span><strong>{result.removed_column_count}</strong></div>
      </div>
      <div className="trimming-track bmge-track" aria-label="BMGE retained and removed columns">
        {buildTrackSegments(result).map((segment) => (
          <span
            key={`${segment.kind}-${segment.start}-${segment.end}`}
            className={segment.kind === "removed" ? "removed" : "retained"}
            style={{ flexGrow: segment.length }}
            title={`${segment.kind === "removed" ? "删除" : "保留"} ${segment.start}-${segment.end}`}
          />
        ))}
      </div>
      <section className="report-block">
        <div className="block-title-row">
          <h3>删除区间</h3>
          <span>平均标准化熵 {result.mean_normalized_entropy.toFixed(2)} · GAP {(result.original_gap_ratio * 100).toFixed(1)}% → {(result.trimmed_gap_ratio * 100).toFixed(1)}%</span>
        </div>
        {result.removed_regions.length > 0 ? (
          <div className="table-wrap sequence-heavy-table-wrap">
            <table>
              <thead><tr><th>Start</th><th>End</th><th>Length</th><th>Reason</th><th>Mean GAP</th><th>Mean entropy</th></tr></thead>
              <tbody>
                {result.removed_regions.map((region) => (
                  <tr key={`${region.start}-${region.end}`}>
                    <td>{region.start}</td>
                    <td>{region.end}</td>
                    <td>{region.length}</td>
                    <td>{region.reasons?.join(", ") ?? "removed"}</td>
                    <td>{region.mean_gap_fraction === undefined ? "-" : `${(region.mean_gap_fraction * 100).toFixed(1)}%`}</td>
                    <td>{region.mean_normalized_entropy === undefined ? "-" : region.mean_normalized_entropy.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="quiet-text">当前阈值没有删除任何列。</p>
        )}
      </section>
      <pre className="sequence-preview">{trimmedFasta.slice(0, 1400)}</pre>
      <div className="action-row">
        <button className="secondary-action" type="button" onClick={() => onAnalyzeTrimmed(trimmedFasta)}>
          用 MSA Quality 评估筛选后结果
        </button>
        {onBuildTree ? (
          <button className="secondary-action" type="button" onClick={() => onBuildTree(trimmedFasta)}>
            用 IQ-TREE 建树
          </button>
        ) : null}
      </div>
      <ResultFiles jobId={jobId} files={result.files} />
    </>
  );
}

function buildTrackSegments(result: BmgeResult): Array<{ kind: "retained" | "removed"; start: number; end: number; length: number }> {
  const removed = new Set(result.removed_columns);
  const segments: Array<{ kind: "retained" | "removed"; start: number; end: number; length: number }> = [];
  let start = 1;
  let kind: "retained" | "removed" = removed.has(1) ? "removed" : "retained";
  for (let position = 2; position <= result.original_length; position += 1) {
    const nextKind = removed.has(position) ? "removed" : "retained";
    if (nextKind === kind) continue;
    segments.push({ kind, start, end: position - 1, length: position - start });
    start = position;
    kind = nextKind;
  }
  segments.push({ kind, start, end: result.original_length, length: result.original_length - start + 1 });
  return segments;
}
