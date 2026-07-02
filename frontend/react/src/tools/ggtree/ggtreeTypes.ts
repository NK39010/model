import type { ResultFiles } from "../../shared/types/job";

export interface GgtreePayload {
  newick: string;
  layout: "rectangular" | "circular" | "fan";
  show_tip_labels: boolean;
  show_support: boolean;
  show_branch_length: boolean;
  tip_font_size: number;
  branch_width: number;
  branch_color: string;
  tip_label_color: string;
  support_color: string;
  background_color: string;
  support_threshold: number;
  dpi: number;
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
  branch_width: number;
  branch_color: string;
  tip_label_color: string;
  support_color: string;
  background_color: string;
  support_threshold: number;
  dpi: number;
  width: number;
  height: number;
  tip_count: number;
  command: string[];
  rscript_binary: string;
  files: ResultFiles;
}
