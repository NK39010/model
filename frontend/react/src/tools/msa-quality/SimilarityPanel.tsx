import { HelpTip } from "../../shared/components/HelpTip";
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
          <span className="metric-label">平均成对一致性<HelpTip text="所有序列两两比较后的平均一致性；低值可能提示序列同源性弱、混入远缘序列或比对困难。" /></span>
          <strong>{(similarity.average_identity * 100).toFixed(1)}%</strong>
        </div>
        <div>
          <span className="metric-label">低成对一致性阈值<HelpTip text="低于该阈值的序列对会被列为低一致性序列对，用于发现可能不适合同组分析的序列。" /></span>
          <strong>{(similarity.low_identity_threshold * 100).toFixed(0)}%</strong>
        </div>
        <div>
          <span className="metric-label">低成对一致性序列对<HelpTip text="两两一致性低于阈值的序列组合数量；数量多时建议检查输入序列是否属于同一同源组。" /></span>
          <strong>{similarity.low_identity_pairs.length}</strong>
        </div>
        <div>
          <span className="metric-label">疑似离群序列<HelpTip text="平均成对一致性明显低于总体水平的序列，可能是远缘序列、错误注释序列或低质量序列。" /></span>
          <strong>{similarity.outlier_sequences.length}</strong>
        </div>
      </div>
      <IdentityHeatmap identityMatrix={similarity.identity_matrix} />
      <section className="report-block">
        <h3>低成对一致性序列对</h3>
        {similarity.low_identity_pairs.length === 0 ? (
          <p className="quiet-text">没有序列对低于当前成对一致性阈值。</p>
        ) : (
          <div className="table-wrap sequence-heavy-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>序列 A</th><th>序列 B</th><th>成对一致性</th><th>可比较比对列数</th>
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
        <h3>疑似离群序列</h3>
        {similarity.outlier_sequences.length === 0 ? (
          <p className="quiet-text">根据平均成对序列一致性，未检测到明显离群序列。</p>
        ) : (
          <div className="table-wrap sequence-heavy-table-wrap outlier-sequence-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>序列</th><th>平均成对一致性</th><th>与总体均值差异</th>
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
