import type { ResultFiles } from "../../shared/types/job";

export interface TrimalPayload {
  aligned_fasta: string;
  sequence_type: "auto" | "dna" | "rna" | "protein";
  mode: "automated1" | "gappyout" | "strict" | "strictplus" | "manual";
  strict: boolean;
  gap_threshold: number;
  conservation_threshold: number;
}

export interface TrimalRecord {
  name: string;
  sequence: string;
  ungapped_length: number;
}

export interface TrimalRegion {
  start: number;
  end: number;
  length: number;
  reasons?: string[];
  mean_gap_fraction?: number;
  mean_conservation?: number;
}

export interface TrimalResult {
  tool: "trimal_alignment_trimming";
  mode: TrimalPayload["mode"];
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
  gap_threshold: number;
  conservation_threshold: number;
  retained_columns: number[];
  removed_columns: number[];
  retained_regions: TrimalRegion[];
  removed_regions: TrimalRegion[];
  trimmed_records: TrimalRecord[];
  files: ResultFiles;
}
