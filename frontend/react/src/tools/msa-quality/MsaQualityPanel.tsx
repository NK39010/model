import { useEffect, useState } from "react";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { FilePicker } from "../../shared/components/FilePicker";
import { StatusMessage } from "../../shared/components/StatusMessage";
import type { JobRecord } from "../../shared/types/job";
import { parseFasta } from "../../shared/utils/fasta";
import { MsaQualityReport } from "./MsaQualityReport";
import { runMsaQuality } from "./msaQualityApi";
import type { MsaQualityPayload, MsaQualityResult } from "./msaQualityTypes";

const EXAMPLE_ALIGNED = `>Human
ATGCTAGCTAGCTACGATCG
>Mouse
ATGCTAGATAGCTACGATCG
>Dog
ATGCTAGCTAG-TACGATCG`;

interface MsaQualityPanelProps {
  initialFasta?: string;
}

export function MsaQualityPanel({ initialFasta = "" }: MsaQualityPanelProps) {
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
  const [isInputOpen, setIsInputOpen] = useState(true);
  const [inputFile, setInputFile] = useState<{ name: string; size: number } | null>(null);

  useEffect(() => {
    if (initialFasta) {
      setPayload((current) => ({ ...current, aligned_fasta: initialFasta }));
    }
  }, [initialFasta]);

  const submit = async () => {
    const records = parseFasta(payload.aligned_fasta);
    if (records.length < 2 || new Set(records.map((record) => record.sequence.length)).size !== 1) {
      setError("MSA Quality 需要至少两条长度一致的已比对序列。");
      setIsInputOpen(true);
      return;
    }
    setIsRunning(true);
    setError("");
    try {
      const nextJob = await runMsaQuality(payload);
      setJob(nextJob);
      setIsInputOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "MSA_quality failed.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className={`tool-layout msa-layout ${isInputOpen ? "" : "input-collapsed"}`}>
      <div className={`tool-editor msa-editor collapsible-card ${isInputOpen ? "open" : "closed"}`}>
        <div className="collapsible-card-header">
          <button className="input-toggle-button" type="button" onClick={() => setIsInputOpen((value) => !value)} aria-expanded={isInputOpen}>
            <div className="input-card-title">
            <p className="eyebrow">MSA_quality</p>
            <h2>{isInputOpen ? "Input" : "MSA Quality Input"}</h2>
            </div>
            {!isInputOpen ? <span className="input-parameter-summary">{inputFile ? `${inputFile.name} · ${parseFasta(payload.aligned_fasta).length} seq · ` : ""}{payload.sequence_type.charAt(0).toUpperCase() + payload.sequence_type.slice(1)} · Gap {payload.high_gap_threshold.toFixed(2)} · Cons. {payload.low_conservation_threshold.toFixed(2)}</span> : null}
            <span className="input-toggle-label">{isInputOpen ? "⌃" : "⌄"}</span>
          </button>
          <button className="header-run-action" disabled={isRunning} onClick={submit}>{isRunning ? "◌ RUNNING" : "▶ RUN"}</button>
        </div>
        <div className="collapsible-card-body">
          <div className="input-workspace">
          <div className="sequence-input-column">
            <FilePicker fileName={inputFile?.name} detail={inputFile ? `${parseFasta(payload.aligned_fasta).length} sequences · ${(inputFile.size / 1024).toFixed(1)} KB` : "所有序列必须已经比对且长度一致"} onFile={(file, text) => { setInputFile({ name: file.name, size: file.size }); setPayload({ ...payload, aligned_fasta: text }); setError(""); }} />
            <label className="field">
            <span>已比对 FASTA</span>
            <textarea
              value={payload.aligned_fasta}
              onChange={(event) => setPayload({ ...payload, aligned_fasta: event.target.value })}
              spellCheck={false}
            />
            </label>
          </div>
          <div className="input-controls-column"><div className="control-grid">
            <label className="field">
              <span>序列类型</span>
              <select
                value={payload.sequence_type}
                onChange={(event) =>
                  setPayload({ ...payload, sequence_type: event.target.value as MsaQualityPayload["sequence_type"] })
                }
              >
                <option value="auto">Auto</option>
                <option value="dna">DNA</option>
                <option value="rna">RNA</option>
                <option value="protein">Protein</option>
              </select>
            </label>
            <label className="field">
              <span>高 Gap 阈值</span>
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
              <span>低保守阈值</span>
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
              严格字符校验
            </label>
          </div>
          </div></div>
        </div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>

      <div className="msa-report-shell">
        {job?.result ? (
          <>
            <MsaQualityReport result={job.result} />
            <ResultFiles jobId={job.id} files={job.result.files} />
          </>
        ) : (
          <StatusMessage>提交已比对 FASTA 后，这里会生成 FastQC 风格的质量报告。</StatusMessage>
        )}
      </div>
    </section>
  );
}
