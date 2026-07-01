import type { ConsensusResult } from "./msaQualityTypes";

interface ConsensusPanelProps {
  consensus: ConsensusResult;
}

export function ConsensusPanel({ consensus }: ConsensusPanelProps) {
  return (
    <section className="report-block">
      <div className="block-title-row">
        <h3>Consensus Sequence</h3>
        <span>{(consensus.mean_support * 100).toFixed(1)}% mean support</span>
      </div>
      <pre className="consensus-sequence">{consensus.sequence.match(/.{1,100}/g)?.join("\n") ?? consensus.sequence}</pre>
    </section>
  );
}
