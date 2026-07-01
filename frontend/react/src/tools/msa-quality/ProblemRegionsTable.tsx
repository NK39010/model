import type { ProblematicRegion } from "./msaQualityTypes";

interface ProblemRegionsTableProps {
  regions: ProblematicRegion[];
  onSelectRegion: (start: number) => void;
}

export function ProblemRegionsTable({ regions, onSelectRegion }: ProblemRegionsTableProps) {
  return (
    <section className="report-block">
      <h3>Problematic Regions</h3>
      {regions.length === 0 ? (
        <p className="quiet-text">No problematic regions were detected with the current thresholds.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Length</th>
                <th>Reasons</th>
                <th>Gap</th>
                <th>Conservation</th>
                <th>Entropy</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((region) => (
                <tr key={`${region.start}-${region.end}`}>
                  <td>
                    <button className="link-button" onClick={() => onSelectRegion(region.start)}>
                      {region.start}-{region.end}
                    </button>
                  </td>
                  <td>{region.length}</td>
                  <td>{region.reasons.join(", ")}</td>
                  <td>{(region.mean_gap_fraction * 100).toFixed(1)}%</td>
                  <td>{(region.mean_conservation * 100).toFixed(1)}%</td>
                  <td>{region.mean_entropy.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
