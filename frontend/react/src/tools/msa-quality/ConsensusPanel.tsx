import { HelpTip } from "../../shared/components/HelpTip";
import type { ConsensusResult } from "./msaQualityTypes";

interface ConsensusPanelProps {
  consensus: ConsensusResult;
}

export function ConsensusPanel({ consensus }: ConsensusPanelProps) {
  return (
    <section className="report-block">
      <div className="block-title-row">
        <h3>共识序列 <HelpTip text="每个比对列选择支持度最高的字符作为共识字符；当证据不足或字符过于分散时可能产生模糊字符。" /></h3>
        <span>平均共识支持度 {(consensus.mean_support * 100).toFixed(1)}% <HelpTip text="共识字符在各比对列中获得支持的平均比例。" /></span>
      </div>
      <pre className="consensus-sequence">{consensus.sequence.match(/.{1,100}/g)?.join("\n") ?? consensus.sequence}</pre>
    </section>
  );
}
