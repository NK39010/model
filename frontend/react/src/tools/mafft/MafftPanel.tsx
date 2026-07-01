import { useMemo, useState } from "react";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { FilePicker } from "../../shared/components/FilePicker";
import { StatusMessage } from "../../shared/components/StatusMessage";
import type { JobRecord } from "../../shared/types/job";
import { parseFasta, recordsToFasta } from "../../shared/utils/fasta";
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

interface MafftPanelProps {
  onAnalyzeAlignment: (alignedFasta: string) => void;
}

export function MafftPanel({ onAnalyzeAlignment }: MafftPanelProps) {
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
      setIsInputOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "MAFFT failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const alignedFasta = job?.result ? recordsToFasta(job.result.aligned_records) : "";

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
          <button className="header-run-action" disabled={isRunning} onClick={submit}>{isRunning ? "◌ RUNNING" : "▶ RUN"}</button>
        </div>

        <div className="collapsible-card-body">
          <div className="input-workspace">
          <div className="sequence-input-column">
            <FilePicker fileName={inputFile?.name} detail={inputFile ? `${parseFasta(payload.fasta).length} sequences · ${(inputFile.size / 1024).toFixed(1)} KB` : undefined} onFile={(file, text) => { setInputFile({ name: file.name, size: file.size }); setPayload({ ...payload, fasta: text }); }} />
            <label className="field">
            <span>输入 FASTA</span>
            <textarea
              value={payload.fasta}
              onChange={(event) => setPayload({ ...payload, fasta: event.target.value })}
              spellCheck={false}
            />
            </label>
          </div>

          <div className="input-controls-column"><div className="control-grid">
            <label className="field">
              <span>模式</span>
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
              <span>序列类型</span>
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
              <span>线程</span>
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
              严格字符校验
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
