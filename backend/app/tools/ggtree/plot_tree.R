#!/usr/bin/env Rscript

script_path_from_args <- function() {
  file_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  if (length(file_arg) == 0) return("backend/app/tools/ggtree/plot_tree.R")
  sub("^--file=", "", file_arg[[1]])
}

script_dir <- dirname(normalizePath(script_path_from_args(), mustWork = FALSE))
module_dir <- file.path(script_dir, "R")

source(file.path(module_dir, "read_style.R"))
source(file.path(module_dir, "tree_mapping.R"))
source(file.path(module_dir, "base_plot.R"))
source(file.path(module_dir, "apply_labels.R"))
source(file.path(module_dir, "apply_support.R"))
source(file.path(module_dir, "apply_clades.R"))
source(file.path(module_dir, "apply_theme.R"))
source(file.path(module_dir, "export_plot.R"))

args <- commandArgs(trailingOnly = TRUE)
parsed <- parse_plot_args(args)
assert_plot_packages(required_plot_packages(parsed$style_path))

frontend_style <- read_frontend_style(parsed$style_path)
style <- normalize_style(frontend_style, parsed$defaults)
tree <- ape::read.tree(parsed$treefile)

plot <- make_base_plot(tree, style)
plot <- apply_clade_collapses(plot, tree, style)
plot <- apply_tip_labels(plot, style)
plot <- apply_node_points(plot, style)
plot <- apply_support_labels(plot, tree, style)
plot <- apply_clade_highlights(plot, tree, style)
plot <- apply_tree_theme(plot, style)

export_plot_files(plot, parsed$output_prefix, style)

cat("ggtree plot generated for", length(tree$tip.label), "tips\n")
