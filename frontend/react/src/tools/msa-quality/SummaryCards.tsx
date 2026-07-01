import type { QualitySummary } from "./msaQualityTypes";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface SummaryCardsProps {
  summary: QualitySummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    { label: "Quality Score", value: `${summary.quality_score}/100`, tone: summary.quality_status },
    { label: "Sequences", value: summary.sequence_count.toLocaleString() },
    { label: "Alignment Length", value: summary.alignment_length.toLocaleString() },
    { label: "Average Identity", value: percent(summary.average_identity) },
    { label: "Gap Ratio", value: percent(summary.gap_ratio) },
    { label: "Variable Sites", value: summary.variable_sites.toLocaleString() },
    { label: "Conserved Sites", value: summary.conserved_sites.toLocaleString() },
    { label: "Problem Regions", value: summary.problematic_region_count.toLocaleString() }
  ];

  return (
    <div className="quality-cards">
      {cards.map((card) => (
        <div className={`quality-card quality-card-${card.tone ?? "neutral"}`} key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}
