import type { ResultFiles } from "../../shared/types/job";

export interface MafftRecord {
  name: string;
  sequence: string;
}

export interface MafftPayload {
  fasta: string;
  mode: "auto" | "ginsi" | "linsi" | "einsi" | "fftns2";
  sequence_type: "auto" | "dna" | "rna" | "protein";
  strict: boolean;
  thread_count: number;
}

export interface MafftResult {
  tool: "mafft_alignment";
  mode: string;
  sequence_type: string;
  input_sequence_count: number;
  alignment_length: number;
  command: string[];
  aligned_records: MafftRecord[];
  files: ResultFiles;
}
