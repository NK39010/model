import { useState } from "react";
import { AlignmentBrowser } from "./AlignmentBrowser";
import { ConsensusPanel } from "./ConsensusPanel";
import type { MsaQualityResult, MsaQualitySections } from "./msaQualityTypes";
import { ProblemRegionsTable } from "./ProblemRegionsTable";
import { QualityTracks } from "./QualityTracks";
import { SequenceGapChart } from "./SequenceGapChart";
import { SimilarityPanel } from "./SimilarityPanel";
import { SummaryCards } from "./SummaryCards";

interface MsaQualityReportProps {
  result: MsaQualityResult;
}

export function MsaQualityReport({ result }: MsaQualityReportProps) {
  const [focusStart, setFocusStart] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const sections = result.sections ?? sectionsFromLegacyResult(result);

  const openBrowserAt = (start: number) => {
    setFocusStart(start);
    setActiveTab("browser");
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
          <SummaryCards summary={sections.overview.summary} />
          {sections.overview.recommendations.length > 0 ? (
            <section className="recommendations">
              {sections.overview.recommendations.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "gap" ? (
        <div className="section-stack">
          <div className="metric-strip">
            <div>
              <span>Overall Gap Ratio</span>
              <strong>{(sections.gap_quality.overall_gap_ratio * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>High Gap Columns</span>
              <strong>{sections.gap_quality.high_gap_columns}</strong>
            </div>
            <div>
              <span>Gap Regions</span>
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
              <span>Mean Conservation</span>
              <strong>{(sections.conservation_variation.mean_conservation * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>Average Entropy</span>
              <strong>{sections.conservation_variation.average_entropy.toFixed(2)}</strong>
            </div>
            <div>
              <span>Variable Sites</span>
              <strong>{sections.conservation_variation.variable_sites}</strong>
            </div>
            <div>
              <span>Conserved Sites</span>
              <strong>{sections.conservation_variation.conserved_sites}</strong>
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
              <span>Consensus Length</span>
              <strong>{sections.consensus.length}</strong>
            </div>
            <div>
              <span>Mean Support</span>
              <strong>{(sections.consensus.mean_support * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span>Ambiguous Positions</span>
              <strong>{sections.consensus.ambiguous_positions.length}</strong>
            </div>
            <div>
              <span>Gap Consensus</span>
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
        />
      ) : null}
    </div>
  );
}

type ReportTab = "overview" | "gap" | "conservation" | "similarity" | "consensus" | "browser";

const REPORT_TABS: Array<{ key: ReportTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "gap", label: "Gap Quality" },
  { key: "conservation", label: "Conservation" },
  { key: "similarity", label: "Similarity" },
  { key: "consensus", label: "Consensus" },
  { key: "browser", label: "Browser" }
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
