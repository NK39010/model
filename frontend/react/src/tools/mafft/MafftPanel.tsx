import { useMemo, useState } from "react";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { getJob } from "../../api/jobs";
import { FilePicker } from "../../shared/components/FilePicker";
import { HelpTip } from "../../shared/components/HelpTip";
import { StatusMessage } from "../../shared/components/StatusMessage";
import { ToolHistoryMenu } from "../../shared/components/ToolHistoryMenu";
import type { JobRecord } from "../../shared/types/job";
import { parseFasta, recordsToFasta } from "../../shared/utils/fasta";
import { addToolHistory, readToolHistory, type ToolHistoryItem } from "../../shared/utils/toolHistory";
import { runMafft } from "./mafftApi";
import type { MafftPayload, MafftResult } from "./mafftTypes";

const EXAMPLE_FASTA = `>Human
ATGCTAGCTAGCTACGATCG
>Mouse
ATGCTAGATAGCTACGATCG
>Dog
ATGCTAGCTAG-TACGATCG`;

const MODE_OPTIONS = [
  { value: "auto", label: "Auto", description: "默认自动选择，适合大多数普通数据。" },
  { value: "ginsi", label: "G-INS-i", description: "全局同源、全长可比的序列，准确度高。" },
  { value: "linsi", label: "L-INS-i", description: "局部同源区域较强、序列长度有差异时更稳。" },
  { value: "einsi", label: "E-INS-i", description: "保守区之间存在长插入或低复杂度区域时使用。" },
  { value: "fftns2", label: "FFT-NS-2", description: "快速模式，适合数量多、初步筛查。" }
] as const;

const MAFFT_TOOL_NAME = "mafft_alignment";

interface MafftPanelProps {
  onAnalyzeAlignment: (alignedFasta: string) => void;
  onBuildTree?: (alignedFasta: string) => void;
}

export function MafftPanel({ onAnalyzeAlignment, onBuildTree }: MafftPanelProps) {
  const [payload, setPayload] = useState<MafftPayload>({
    fasta: EXAMPLE_FASTA,
    mode: "auto",
    sequence_type: "auto",
    strict: false,
    thread_count: 1
  });
  const [job, setJob] = useState<JobRecord<MafftResult> | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isInputOpen, setIsInputOpen] = useState(true);
  const [inputFile, setInputFile] = useState<{ name: string; size: number } | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<ToolHistoryItem<MafftPayload>>>(() =>
    readToolHistory<MafftPayload>(MAFFT_TOOL_NAME)
  );

  const selectedMode = useMemo(
    () => MODE_OPTIONS.find((option) => option.value === payload.mode) ?? MODE_OPTIONS[0],
    [payload.mode]
  );

  const submit = async () => {
    setIsRunning(true);
    setError("");
    try {
      const nextJob = await runMafft(payload);
      setJob(nextJob);
      setHistoryItems(
        addToolHistory<MafftPayload>(MAFFT_TOOL_NAME, {
          fileName: inputFile?.name ?? "Untitled FASTA",
          summary: `${parseFasta(payload.fasta).length} seq`,
          paramsSummary: `${selectedMode.label} · ${payload.sequence_type.toUpperCase()} · ${payload.thread_count} Thread`,
          payload,
          jobId: nextJob.id,
          inputFileSize: inputFile?.size
        })
      );
      setIsInputOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "MAFFT failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const alignedFasta = job?.result ? recordsToFasta(job.result.aligned_records) : "";

  const restoreHistory = async (item: ToolHistoryItem<MafftPayload>) => {
    setPayload(item.payload);
    setInputFile(item.inputFileSize === undefined ? null : { name: item.fileName, size: item.inputFileSize });
    setError("");
    if (!item.jobId) {
      setJob(null);
      setIsInputOpen(true);
      return;
    }
    setIsRunning(true);
    try {
      setJob(await getJob<MafftResult>(item.jobId));
      setIsInputOpen(false);
    } catch (caught) {
      setJob(null);
      setError(caught instanceof Error ? caught.message : "无法读取历史结果。");
      setIsInputOpen(true);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className={`tool-layout ${isInputOpen ? "" : "input-collapsed"}`}>
      <div className={`tool-editor collapsible-card ${isInputOpen ? "open" : "closed"}`}>
        <div className="collapsible-card-header">
          <button className="input-toggle-button" type="button" onClick={() => setIsInputOpen((value) => !value)} aria-expanded={isInputOpen}>
            <div className="input-card-title">
            <p className="eyebrow">MAFFT</p>
            <h2>{isInputOpen ? "Input" : "MAFFT Input"}</h2>
            </div>
            {!isInputOpen ? <span className="input-parameter-summary">{inputFile ? `${inputFile.name} · ${parseFasta(payload.fasta).length} seq · ` : ""}{selectedMode.label} · {payload.sequence_type.toUpperCase()} · {payload.thread_count} Thread</span> : null}
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
            <FilePicker fileName={inputFile?.name} detail={inputFile ? `${parseFasta(payload.fasta).length} sequences · ${(inputFile.size / 1024).toFixed(1)} KB` : undefined} onFile={(file, text) => { setInputFile({ name: file.name, size: file.size }); setPayload({ ...payload, fasta: text }); }} />
            <label className="field">
            <span>输入 FASTA <HelpTip text="粘贴或导入至少两条未比对的 DNA、RNA 或蛋白质 FASTA 序列。" /></span>
            <textarea
              value={payload.fasta}
              onChange={(event) => setPayload({ ...payload, fasta: event.target.value })}
              spellCheck={false}
            />
            </label>
          </div>

          <div className="input-controls-column"><div className="control-grid">
            <label className="field">
              <span>模式 <HelpTip text={"Auto：根据序列数量和长度自动选择策略，适合一般任务。\nG-INS-i：假设序列全长同源，适合长度相近、整体可比的数据；精度高、速度慢。\nL-INS-i：允许局部同源，适合包含保守结构域或序列长度差异较大的数据；通常精度很高、计算开销最大。\nE-INS-i：适合多个保守区之间存在长插入、长缺失或低复杂度区域的数据；速度较慢。\nFFT-NS-2：快速渐进式比对，适合大量序列、初步筛查或快速预览；精度通常低于 INS-i 系列。"} /></span>
              <select
                value={payload.mode}
                onChange={(event) => setPayload({ ...payload, mode: event.target.value as MafftPayload["mode"] })}
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>序列类型 <HelpTip text="Auto 自动识别；明确知道输入类型时可选择 DNA、RNA 或 Protein。" /></span>
              <select
                value={payload.sequence_type}
                onChange={(event) =>
                  setPayload({ ...payload, sequence_type: event.target.value as MafftPayload["sequence_type"] })
                }
              >
                <option value="auto">Auto</option>
                <option value="dna">DNA</option>
                <option value="rna">RNA</option>
                <option value="protein">Protein</option>
              </select>
            </label>
            <label className="field">
              <span>线程 <HelpTip text="并行计算线程数。增加线程通常能加快比对，但会占用更多 CPU。" /></span>
              <input
                type="number"
                min={1}
                max={32}
                value={payload.thread_count}
                onChange={(event) => setPayload({ ...payload, thread_count: Number(event.target.value) })}
              />
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={payload.strict}
                onChange={(event) => setPayload({ ...payload, strict: event.target.checked })}
              />
              严格字符校验 <HelpTip text="启用后拒绝不属于所选序列类型的字符；关闭时允许 X、N 等模糊字符。" />
            </label>
          </div>

          <div className="mode-note">
            <strong>{selectedMode.label}</strong>
            <span>{selectedMode.description}</span>
          </div>
          </div></div>
        </div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>

      <div className="tool-results">
        {job?.result ? (
          <>
            <div className="summary-row">
              <div>
                <span>Sequences</span>
                <strong>{job.result.input_sequence_count}</strong>
              </div>
              <div>
                <span>Alignment length</span>
                <strong>{job.result.alignment_length}</strong>
              </div>
              <div>
                <span>Mode</span>
                <strong>{job.result.mode}</strong>
              </div>
            </div>
            <pre className="sequence-preview">{alignedFasta.slice(0, 1400)}</pre>
            <div className="action-row">
              <button className="secondary-action" onClick={() => onAnalyzeAlignment(alignedFasta)}>
                Analyze with MSA Quality
              </button>
              {onBuildTree ? (
                <button className="secondary-action" type="button" onClick={() => onBuildTree(alignedFasta)}>
                  用 IQ-TREE 建树
                </button>
              ) : null}
            </div>
            <ResultFiles jobId={job.id} files={job.result.files} />
          </>
        ) : (
          <StatusMessage>运行后会显示 aligned FASTA、下载文件和质量分析入口。</StatusMessage>
        )}
      </div>
    </section>
  );
}
