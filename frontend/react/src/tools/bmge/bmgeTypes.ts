import type { ResultFiles } from "../../shared/types/job";

export interface BmgePayload {
  aligned_fasta: string;
  sequence_type: "auto" | "dna" | "rna" | "protein";
  strict: boolean;
  entropy_threshold: number;
  gap_rate_cutoff: number;
}

export interface BmgeRecord {
  name: string;
  sequence: string;
  ungapped_length: number;
}

export interface BmgeRegion {
  start: number;
  end: number;
  length: number;
  reasons?: string[];
  mean_gap_fraction?: number;
  mean_normalized_entropy?: number;
}

export interface BmgeResult {
  tool: "BMGE";
  sequence_type: string;
  input_sequence_count: number;
  original_length: number;
  trimmed_length: number;
  removed_column_count: number;
  retained_column_count: number;
  retained_fraction: number;
  original_gap_ratio: number;
  trimmed_gap_ratio: number;
  gap_ratio_delta: number;
  entropy_threshold: number;
  gap_rate_cutoff: number;
  mean_entropy: number;
  mean_normalized_entropy: number;
  retained_columns: number[];
  removed_columns: number[];
  retained_regions: BmgeRegion[];
  removed_regions: BmgeRegion[];
  trimmed_records: BmgeRecord[];
  files: ResultFiles;
}
