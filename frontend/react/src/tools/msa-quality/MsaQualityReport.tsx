import { useState } from "react";
import { HelpTip } from "../../shared/components/HelpTip";
import { AlignmentBrowser } from "./AlignmentBrowser";
import { ConsensusPanel } from "./ConsensusPanel";
import type { MsaQualityResult, MsaQualitySections } from "./msaQualityTypes";
import { ProblemRegionsTable } from "./ProblemRegionsTable";
import { QualityTracks } from "./QualityTracks";
import { SequenceGapChart } from "./SequenceGapChart";
import { SimilarityPanel } from "./SimilarityPanel";
import { SummaryCards } from "./SummaryCards";
import { recommendationZh } from "./msaQualityI18n";

interface MsaQualityReportProps {
  result: MsaQualityResult;
}

export function MsaQualityReport({ result }: MsaQualityReportProps) {
  const [focusStart, setFocusStart] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const [highlightMode, setHighlightMode] = useState<HighlightMode>(null);
  const sections = result.sections ?? sectionsFromLegacyResult(result);
  const conservedPositions = sections.alignment_browser.position_annotations
    .filter(isConservedPosition)
    .map((row) => row.position);

  const openBrowserAt = (start: number) => {
    setFocusStart(start);
    setActiveTab("browser");
  };

  const showConservedPositions = () => {
    setHighlightMode("conserved");
    setFocusStart(conservedPositions[0] ?? 1);
    setActiveTab("browser");
  };

  const clearHighlight = () => {
    setHighlightMode(null);
  };

  return (
    <div className="msa-report">
      <div className="report-tabs" role="tablist" aria-label="MSA quality sections">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="section-stack">
          <SummaryCards summary={sections.overview.summary} onViewConservedPositions={showConservedPositions} />
          {sections.overview.recommendations.length > 0 ? (
            <section className="recommendations">
              {sections.overview.recommendations.map((item) => (
                <p key={item}>{recommendationZh(item)}</p>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "gap" ? (
        <div className="section-stack">
          <div className="metric-strip">
            <div>
              <span className="metric-label">整体 GAP 比例<HelpTip text="全部比对列和全部序列中 GAP 字符的总体占比。高值说明插入/缺失、末端缺失或覆盖差异较多。" /></span>
              <strong>{(sections.gap_quality.overall_gap_ratio * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span className="metric-label">高 GAP 比对列数<HelpTip text="GAP 比例达到当前高 GAP 阈值的比对列数量；这类列通常不适合直接解释为可靠保守位点。" /></span>
              <strong>{sections.gap_quality.high_gap_columns}</strong>
            </div>
            <div>
              <span className="metric-label">GAP 相关低质量区域<HelpTip text="由连续高 GAP 比对列组成的区域，常见于局部插入、序列末端或低质量比对片段。" /></span>
              <strong>{sections.gap_quality.gap_regions.length}</strong>
            </div>
          </div>
          <SequenceGapChart rows={sections.gap_quality.sequence_gap_rows} />
          <ProblemRegionsTable regions={sections.gap_quality.gap_regions} onSelectRegion={openBrowserAt} />
        </div>
      ) : null}

      {activeTab === "conservation" ? (
        <div className="section-stack">
          <div className="metric-strip">
            <div>
              <span className="metric-label">平均保守性<HelpTip text="各比对列非 GAP 残基中主导字符比例的平均值；它不自动惩罚 GAP，因此需要结合 GAP 比例一起解读。" /></span>
              <strong>{(sections.conservation_variation.mean_conservation * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span className="metric-label">平均熵<HelpTip text="衡量每个比对列字符组成的不确定性。熵值越高，说明该列残基越分散、变异越明显。" /></span>
              <strong>{sections.conservation_variation.average_entropy.toFixed(2)}</strong>
            </div>
            <div>
              <span className="metric-label">可变位点数<HelpTip text="非 GAP 残基出现两种或更多字符的比对列数量，可反映序列间差异。" /></span>
              <strong>{sections.conservation_variation.variable_sites}</strong>
            </div>
            <div>
              <span className="metric-label">保守位点数<HelpTip text="无 GAP 且所有非 GAP 残基完全一致的比对列数量。点击“查看位点”可在序列速览中高亮这些列。" /></span>
              <strong>{sections.conservation_variation.conserved_sites}</strong>
              <button
                type="button"
                className="metric-action-button"
                onClick={showConservedPositions}
                title="在序列速览中查看并高亮所有保守比对列"
              >
                查看位点
              </button>
            </div>
          </div>
          <QualityTracks result={result} />
          <ProblemRegionsTable
            regions={[
              ...sections.conservation_variation.low_conservation_regions,
              ...sections.conservation_variation.high_entropy_regions
            ]}
            onSelectRegion={openBrowserAt}
          />
        </div>
      ) : null}

      {activeTab === "similarity" ? <SimilarityPanel similarity={sections.similarity} /> : null}

      {activeTab === "consensus" ? (
        <div className="section-stack">
          <div className="metric-strip">
            <div>
              <span className="metric-label">共识序列长度<HelpTip text="根据每个比对列的主导字符生成的共识序列长度，通常等于比对列数。" /></span>
              <strong>{sections.consensus.length}</strong>
            </div>
            <div>
              <span className="metric-label">平均共识支持度<HelpTip text="各比对列中共识字符获得的平均支持比例；支持度越高，代表共识序列越稳定。" /></span>
              <strong>{(sections.consensus.mean_support * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span className="metric-label">模糊位点数<HelpTip text="无法给出明确共识字符的比对列数量，例如 DNA/RNA 中的 N 或蛋白序列中的 X。" /></span>
              <strong>{sections.consensus.ambiguous_positions.length}</strong>
            </div>
            <div>
              <span className="metric-label">共识为 GAP 的位点<HelpTip text="该比对列中 GAP 占主导，导致共识字符为 GAP 的位点数量。" /></span>
              <strong>{sections.consensus.gap_consensus_positions.length}</strong>
            </div>
          </div>
          <ConsensusPanel consensus={sections.consensus} />
        </div>
      ) : null}

      {activeTab === "browser" ? (
        <AlignmentBrowser
          records={sections.alignment_browser.records}
          positions={sections.alignment_browser.position_annotations}
          focusStart={focusStart}
          sequenceType={result.sequence_type}
          highlightedPositions={highlightMode === "conserved" ? conservedPositions : []}
          highlightLabel={highlightMode === "conserved" ? "保守比对列" : undefined}
          highlightCount={highlightMode === "conserved" ? conservedPositions.length : 0}
          onClearHighlight={highlightMode === "conserved" ? clearHighlight : undefined}
        />
      ) : null}
    </div>
  );
}

type ReportTab = "overview" | "gap" | "conservation" | "similarity" | "consensus" | "browser";
type HighlightMode = "conserved" | null;

const REPORT_TABS: Array<{ key: ReportTab; label: string }> = [
  { key: "overview", label: "概览" },
  { key: "gap", label: "GAP 质量" },
  { key: "conservation", label: "保守性" },
  { key: "similarity", label: "相似性" },
  { key: "consensus", label: "共识序列" },
  { key: "browser", label: "序列速览" }
];

function sectionsFromLegacyResult(result: MsaQualityResult): MsaQualitySections {
  return {
    overview: {
      summary: result.summary,
      quality_score: result.quality_score,
      recommendations: result.recommendations
    },
    gap_quality: {
      overall_gap_ratio: result.summary.gap_ratio,
      high_gap_columns: result.summary.high_gap_columns,
      sequence_gap_rows: result.sequence_quality,
      position_gap_track: result.position_quality.map((row) => ({
        position: row.position,
        gap_fraction: row.gap_fraction
      })),
      gap_regions: result.problematic_regions.filter((region) => region.reasons.includes("high_gap"))
    },
    conservation_variation: {
      mean_conservation: result.summary.mean_conservation,
      average_entropy: result.summary.average_entropy,
      variable_sites: result.summary.variable_sites,
      conserved_sites: result.summary.conserved_sites,
      conservation_track: result.position_quality.map((row) => ({
        position: row.position,
        conservation: row.conservation
      })),
      entropy_track: result.position_quality.map((row) => ({
        position: row.position,
        entropy: row.entropy,
        normalized_entropy: row.normalized_entropy
      })),
      low_conservation_regions: result.problematic_regions.filter((region) =>
        region.reasons.includes("low_conservation")
      ),
      high_entropy_regions: result.problematic_regions.filter((region) => region.reasons.includes("high_entropy"))
    },
    similarity: {
      average_identity: result.summary.average_identity,
      identity_matrix: result.identity_matrix,
      pairwise_identity: result.pairwise_identity,
      low_identity_threshold: 0.85,
      low_identity_pairs: result.pairwise_identity.filter((row) => row.identity < 0.85),
      outlier_delta: 0.15,
      outlier_sequences: []
    },
    consensus: {
      ...result.consensus,
      support_track: result.consensus.records.map((row) => ({ position: row.position, support: row.support })),
      ambiguous_positions: result.consensus.records
        .filter((row) => row.consensus === "N" || row.consensus === "X")
        .map((row) => row.position),
      gap_consensus_positions: result.consensus.records
        .filter((row) => row.consensus === "-")
        .map((row) => row.position)
    },
    alignment_browser: {
      records: result.aligned_records,
      position_annotations: result.position_quality
    }
  };
}

function isConservedPosition(row: MsaQualityResult["position_quality"][number]): boolean {
  return Boolean(row.is_conserved ?? (row.gap_fraction === 0 && row.conservation >= 1));
}
