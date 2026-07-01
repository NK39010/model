import type { ResultFiles } from "../../shared/types/job";

export interface IqtreePayload {
  aligned_fasta: string;
  sequence_type: "auto" | "dna" | "rna" | "protein";
  strict: boolean;
  model_mode: "auto" | "fixed";
  model: string;
  bootstrap_enabled: boolean;
  bootstrap_replicates: number;
  alrt_enabled: boolean;
  alrt_replicates: number;
  thread_mode: "auto" | "fixed";
  thread_count: number;
  random_seed?: number;
}

export interface IqtreeResult {
  tool: "iqtree_phylogeny";
  sequence_type: string;
  model_mode: IqtreePayload["model_mode"];
  model_requested: string;
  iqtree_model: string;
  best_model: string | null;
  log_likelihood: number | null;
  bootstrap_enabled: boolean;
  bootstrap_replicates: number;
  alrt_enabled: boolean;
  alrt_replicates: number;
  thread_mode: IqtreePayload["thread_mode"];
  thread_count: number;
  random_seed: number | null;
  sequence_count: number;
  alignment_length: number;
  newick: string;
  tree_summary: {
    tip_count: number;
    tip_labels: string[];
    has_support_values: boolean;
    support_count: number;
  };
  command: string[];
  iqtree_binary: string;
  iqtree_binary_source: string;
  files: ResultFiles;
}
