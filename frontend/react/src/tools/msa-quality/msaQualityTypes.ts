import type { ResultFiles } from "../../shared/types/job";

export interface AlignedRecord {
  name: string;
  sequence: string;
  ungapped_length: number;
}

export interface MsaQualityPayload {
  aligned_fasta: string;
  sequence_type: "auto" | "dna" | "rna" | "protein";
  strict: boolean;
  majority_threshold: number;
  gap_consensus_threshold: number;
  high_gap_threshold: number;
  low_conservation_threshold: number;
  high_entropy_threshold: number;
}

export interface QualitySummary {
  sequence_count: number;
  alignment_length: number;
  gap_ratio: number;
  average_identity: number;
  mean_conservation: number;
  variable_sites: number;
  conserved_sites: number;
  conserved_ratio: number;
  average_entropy: number;
  high_gap_columns: number;
  problematic_region_count: number;
  quality_score: number;
  quality_label: string;
  quality_status: string;
}

export interface SequenceQualityRow {
  name: string;
  alignment_length: number;
  ungapped_length: number;
  gap_count: number;
  gap_fraction: number;
  leading_gaps: number;
  trailing_gaps: number;
}

export interface PositionQualityRow {
  position: number;
  gap_count: number;
  gap_fraction: number;
  conservation: number;
  entropy: number;
  normalized_entropy: number;
  consensus: string;
  consensus_support: number;
  is_conserved?: boolean;
  is_high_gap: boolean;
  is_low_conservation: boolean;
  is_high_entropy: boolean;
}

export interface IdentityMatrix {
  labels: string[];
  matrix: number[][];
}

export interface ConsensusResult {
  sequence: string;
  length: number;
  ungapped_length: number;
  mean_support: number;
  records: Array<{
    position: number;
    consensus: string;
    support: number;
    gap_fraction: number;
    conservation: number;
    entropy: number;
  }>;
}

export interface ProblematicRegion {
  start: number;
  end: number;
  length: number;
  reasons: string[];
  max_gap_fraction?: number;
  min_conservation?: number;
  max_entropy?: number;
  mean_gap_fraction: number;
  mean_conservation: number;
  mean_entropy: number;
}

export interface PairwiseIdentityRow {
  sequence_a: string;
  sequence_b: string;
  identity: number;
  comparable_columns: number;
  match_count: number;
}

export interface SimilarityOutlier {
  name: string;
  mean_identity: number;
  delta_from_average: number;
}

export interface MsaQualitySections {
  overview: {
    summary: QualitySummary;
    quality_score: MsaQualityResult["quality_score"];
    recommendations: string[];
  };
  gap_quality: {
    overall_gap_ratio: number;
    high_gap_columns: number;
    sequence_gap_rows: SequenceQualityRow[];
    position_gap_track: Array<{ position: number; gap_fraction: number }>;
    gap_regions: ProblematicRegion[];
  };
  conservation_variation: {
    mean_conservation: number;
    average_entropy: number;
    variable_sites: number;
    conserved_sites: number;
    conservation_track: Array<{ position: number; conservation: number }>;
    entropy_track: Array<{ position: number; entropy: number; normalized_entropy: number }>;
    low_conservation_regions: ProblematicRegion[];
    high_entropy_regions: ProblematicRegion[];
  };
  similarity: {
    average_identity: number;
    identity_matrix: IdentityMatrix;
    pairwise_identity: PairwiseIdentityRow[];
    low_identity_threshold: number;
    low_identity_pairs: PairwiseIdentityRow[];
    outlier_delta: number;
    outlier_sequences: SimilarityOutlier[];
  };
  consensus: ConsensusResult & {
    support_track: Array<{ position: number; support: number }>;
    ambiguous_positions: number[];
    gap_consensus_positions: number[];
  };
  alignment_browser: {
    records: AlignedRecord[];
    position_annotations: PositionQualityRow[];
  };
}

export interface MsaQualityResult {
  tool: "MSA_quality";
  sequence_type: string;
  aligned_records: AlignedRecord[];
  summary: QualitySummary;
  quality_score: {
    score: number;
    label: string;
    status: string;
  };
  sections?: MsaQualitySections;
  sequence_quality: SequenceQualityRow[];
  position_quality: PositionQualityRow[];
  identity_matrix: IdentityMatrix;
  pairwise_identity: PairwiseIdentityRow[];
  consensus: ConsensusResult;
  problematic_regions: ProblematicRegion[];
  recommendations: string[];
  tracks: {
    gap_fraction: number[];
    conservation: number[];
    entropy: number[];
    normalized_entropy: number[];
    consensus_support: number[];
  };
  files: ResultFiles;
}
