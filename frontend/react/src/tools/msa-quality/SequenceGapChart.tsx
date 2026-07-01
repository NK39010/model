import type { SequenceQualityRow } from "./msaQualityTypes";

interface SequenceGapChartProps {
  rows: SequenceQualityRow[];
}

export function SequenceGapChart({ rows }: SequenceGapChartProps) {
  const sorted = [...rows].sort((a, b) => b.gap_fraction - a.gap_fraction).slice(0, 24);

  return (
    <section className="report-block">
      <h3>Per-sequence Gap Ratio</h3>
      <div className="gap-bars">
        {sorted.map((row) => (
          <div className="gap-bar-row" key={row.name}>
            <span title={row.name}>{row.name}</span>
            <div className="gap-bar-track">
              <div className="gap-bar-fill" style={{ width: `${Math.min(row.gap_fraction * 100, 100)}%` }} />
            </div>
            <strong>{(row.gap_fraction * 100).toFixed(1)}%</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
