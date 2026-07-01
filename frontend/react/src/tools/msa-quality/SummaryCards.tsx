import { HelpTip } from "../../shared/components/HelpTip";
import type { QualitySummary } from "./msaQualityTypes";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface SummaryCardsProps {
  summary: QualitySummary;
  onViewConservedPositions?: () => void;
}

export function SummaryCards({ summary, onViewConservedPositions }: SummaryCardsProps) {
  const cards = [
    { label: "质量评分", value: `${summary.quality_score}/100`, tone: summary.quality_status, help: "综合 GAP 比例、成对序列一致性、保守性和低质量区域数量得到的总体评分；分数越高表示比对整体越可靠。" },
    { label: "序列数量", value: summary.sequence_count.toLocaleString(), help: "参与本次多序列比对质量评估的序列条数。" },
    { label: "比对长度", value: summary.alignment_length.toLocaleString(), help: "比对后的列数，包含 GAP 列；不等同于任一序列去 GAP 后的真实长度。" },
    { label: "平均成对一致性", value: percent(summary.average_identity), help: "所有序列两两比较后的平均一致性，通常用于判断序列是否属于同源或相近序列集合。" },
    { label: "GAP 比例", value: percent(summary.gap_ratio), help: "整个比对矩阵中 GAP 字符所占比例。比例过高通常提示插入/缺失多、末端覆盖不一致或存在低质量区域。" },
    { label: "可变位点", value: summary.variable_sites.toLocaleString(), help: "非 GAP 残基中出现两种或更多字符的比对列，表示该列存在序列差异。" },
    { label: "保守位点", value: summary.conserved_sites.toLocaleString(), help: "所有序列在该比对列均无 GAP，且非 GAP 残基完全一致的列；点击“查看位点”可在序列速览中高亮。", action: onViewConservedPositions },
    { label: "问题区域", value: summary.problematic_region_count.toLocaleString(), help: "连续的低质量比对区段，通常由高 GAP、低保守性或高熵值触发。" }
  ];

  return (
    <div className="quality-cards">
      {cards.map((card) => (
        <div className={`quality-card quality-card-${card.tone ?? "neutral"}`} key={card.label}>
          <span className="metric-label">{card.label}<HelpTip text={card.help} /></span>
          <strong>{card.value}</strong>
          {card.action ? (
            <button
              type="button"
              className="metric-action-button"
              onClick={card.action}
              title="在序列速览中查看并高亮所有保守比对列"
            >
              查看位点
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
