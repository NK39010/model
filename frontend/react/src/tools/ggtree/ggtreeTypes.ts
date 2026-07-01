import type { ResultFiles } from "../../shared/types/job";

export interface GgtreePayload {
  newick: string;
  layout: "rectangular" | "circular" | "fan";
  show_tip_labels: boolean;
  show_support: boolean;
  show_branch_length: boolean;
  tip_font_size: number;
  width: number;
  height: number;
}

export interface GgtreeResult {
  tool: "ggtree_visualization";
  layout: GgtreePayload["layout"];
  show_tip_labels: boolean;
  show_support: boolean;
  show_branch_length: boolean;
  tip_font_size: number;
  width: number;
  height: number;
  tip_count: number;
  command: string[];
  rscript_binary: string;
  files: ResultFiles;
}
