import { HelpTip } from "../../shared/components/HelpTip";
import type { ProblematicRegion } from "./msaQualityTypes";
import { problemReasonLabel } from "./msaQualityI18n";

interface ProblemRegionsTableProps {
  regions: ProblematicRegion[];
  onSelectRegion: (start: number) => void;
}

export function ProblemRegionsTable({ regions, onSelectRegion }: ProblemRegionsTableProps) {
  return (
    <section className="report-block">
      <h3>问题区域 <HelpTip text="连续触发低质量规则的比对区段。原因可能包括高 GAP、低保守性或高熵值；点击区域坐标可跳转到序列速览。" /></h3>
      {regions.length === 0 ? (
        <p className="quiet-text">按当前阈值未检测到问题区域。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>区域</th>
                <th>长度</th>
                <th>原因 <HelpTip text="该区域被标记为低质量的触发规则。" /></th>
                <th>GAP 比例 <HelpTip text="该区域内 GAP 字符的平均比例。" /></th>
                <th>保守性 <HelpTip text="该区域内各列非 GAP 主导字符比例的平均值。" /></th>
                <th>熵值 <HelpTip text="该区域内字符组成不确定性的平均值，越高表示变异越分散。" /></th>
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
                  <td>{region.reasons.map(problemReasonLabel).join("、")}</td>
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
