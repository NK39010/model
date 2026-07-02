import type { ResultFiles } from "../../shared/types/job";

export interface GgtreePayload {
  newick: string;
  layout: "rectangular" | "circular" | "fan";
  show_tip_labels: boolean;
  show_support: boolean;
  show_nodes: boolean;
  show_branch_length: boolean;
  align_tip_labels: boolean;
  tip_font_size: number;
  tip_label_offset: number;
  tip_label_angle: number;
  branch_width: number;
  branch_color: string;
  tip_label_color: string;
  support_mode: "none" | "text" | "low" | "dots";
  support_font_size: number;
  support_color: string;
  background_color: string;
  support_threshold: number;
  tree_theme: "clean" | "axis" | "publication";
  x_expand: number;
  right_margin: number;
  open_angle: number;
  auto_size: boolean;
  dpi: number;
  width: number;
  height: number;
  label_overrides: Record<string, GgtreeLabelOverride>;
  support_overrides: Record<string, GgtreeSupportOverride>;
  node_overrides: Record<string, GgtreeNodeOverride>;
}

export interface GgtreeLabelOverride {
  visible?: boolean;
  color?: string;
  font_size?: number;
  offset?: number;
  angle?: number;
}

export interface GgtreeSupportOverride {
  visible?: boolean;
  color?: string;
  font_size?: number;
  mode?: "text" | "dots";
}

export interface GgtreeNodeOverride {
  branch_highlight?: boolean;
  branch_color?: string;
  branch_width?: number;
  collapsed?: boolean;
}

export interface GgtreeResult {
  tool: "ggtree_visualization";
  layout: GgtreePayload["layout"];
  show_tip_labels: boolean;
  show_support: boolean;
  show_nodes: boolean;
  show_branch_length: boolean;
  align_tip_labels: boolean;
  tip_font_size: number;
  tip_label_offset: number;
  tip_label_angle: number;
  branch_width: number;
  branch_color: string;
  tip_label_color: string;
  support_mode: GgtreePayload["support_mode"];
  effective_support_mode?: GgtreePayload["support_mode"];
  support_font_size: number;
  support_color: string;
  background_color: string;
  support_threshold: number;
  tree_theme: GgtreePayload["tree_theme"];
  x_expand: number;
  right_margin: number;
  open_angle: number;
  auto_size: boolean;
  dpi: number;
  width: number;
  height: number;
  effective_width?: number;
  effective_height?: number;
  effective_tip_font_size?: number;
  label_overrides?: GgtreePayload["label_overrides"];
  support_overrides?: GgtreePayload["support_overrides"];
  node_overrides?: GgtreePayload["node_overrides"];
  tip_count: number;
  command: string[];
  rscript_binary: string;
  files: ResultFiles;
}
