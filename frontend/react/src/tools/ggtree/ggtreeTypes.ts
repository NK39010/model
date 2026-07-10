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
  reroot_node_id: string;
  midpoint_root: boolean;
  preview_only: boolean;
  tip_metadata: Record<string, { sequence_label?: string; species?: string }>;
  show_species_labels: boolean;
  species_font_size: number;
  species_label_color: string;
  species_label_offset: number;
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
  rotated?: boolean;
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
  tree_model?: GgtreeTreeModel;
  layout_data?: GgtreeLayoutData | null;
  command: string[];
  rscript_binary: string;
  files: ResultFiles;
}

export interface GgtreeTreeNode {
  id: string;
  parent_id: string | null;
  children: string[];
  is_tip: boolean;
  original_label: string;
  display_label: string;
  branch_length: number | null;
  support: number | null;
  descendant_tip_ids: string[];
  descendant_labels: string[];
}

export interface GgtreeTreeModel {
  version: 1;
  tree_id: string;
  root_id: string;
  rooted: boolean;
  tip_count: number;
  internal_node_count: number;
  has_branch_lengths: boolean;
  nodes: GgtreeTreeNode[];
  warnings: string[];
}

export interface GgtreeLayoutData {
  version: 1;
  coordinate_system: string;
  bounds?: { x_min: number; x_max: number; y_min: number; y_max: number };
  nodes: Array<{ r_node: number; r_parent: number; node_id?: string; parent_id?: string; descendant_tip_ids?: string[]; descendant_labels?: string[]; x: number; y: number; angle: number; is_tip: boolean; label: string }>;
}
