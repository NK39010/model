import { IdentityHeatmap } from "./IdentityHeatmap";
import type { MsaQualitySections } from "./msaQualityTypes";

interface SimilarityPanelProps {
  similarity: MsaQualitySections["similarity"];
}

export function SimilarityPanel({ similarity }: SimilarityPanelProps) {
  return (
    <div className="section-stack">
      <div className="metric-strip">
        <div>
          <span>Average Identity</span>
          <strong>{(similarity.average_identity * 100).toFixed(1)}%</strong>
        </div>
        <div>
          <span>Low Identity Threshold</span>
          <strong>{(similarity.low_identity_threshold * 100).toFixed(0)}%</strong>
        </div>
        <div>
          <span>Low Identity Pairs</span>
          <strong>{similarity.low_identity_pairs.length}</strong>
        </div>
        <div>
          <span>Possible Outliers</span>
          <strong>{similarity.outlier_sequences.length}</strong>
        </div>
      </div>
      <IdentityHeatmap identityMatrix={similarity.identity_matrix} />
      <section className="report-block">
        <h3>Low Identity Pairs</h3>
        {similarity.low_identity_pairs.length === 0 ? (
          <p className="quiet-text">No sequence pairs fell below the current low-identity threshold.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sequence A</th>
                  <th>Sequence B</th>
                  <th>Identity</th>
                  <th>Comparable Columns</th>
                </tr>
              </thead>
              <tbody>
                {similarity.low_identity_pairs.map((row) => (
                  <tr key={`${row.sequence_a}-${row.sequence_b}`}>
                    <td>{row.sequence_a}</td>
                    <td>{row.sequence_b}</td>
                    <td>{(row.identity * 100).toFixed(1)}%</td>
                    <td>{row.comparable_columns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="report-block">
        <h3>Possible Outliers</h3>
        {similarity.outlier_sequences.length === 0 ? (
          <p className="quiet-text">No obvious outlier sequences were detected from pairwise identity averages.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Mean Identity</th>
                  <th>Delta From Average</th>
                </tr>
              </thead>
              <tbody>
                {similarity.outlier_sequences.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{(row.mean_identity * 100).toFixed(1)}%</td>
                    <td>{(row.delta_from_average * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
