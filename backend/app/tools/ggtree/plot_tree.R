#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 9) {
  stop(
    "Usage: plot_tree.R <treefile> <output_prefix> <layout> <tip_labels> <support> <branch_length> <font_size> <width> <height>",
    call. = FALSE
  )
}

treefile <- args[[1]]
output_prefix <- args[[2]]
layout <- args[[3]]
show_tip_labels <- tolower(args[[4]]) == "true"
show_support <- tolower(args[[5]]) == "true"
show_branch_length <- tolower(args[[6]]) == "true"
tip_font_size <- as.numeric(args[[7]])
plot_width <- as.numeric(args[[8]])
plot_height <- as.numeric(args[[9]])

required_packages <- c("ape", "ggplot2", "ggtree")
missing_packages <- required_packages[!vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing_packages) > 0) {
  stop(
    paste(
      "Missing required R packages:",
      paste(missing_packages, collapse = ", "),
      "Install them with BiocManager::install('ggtree') and install.packages(c('ape', 'ggplot2'))."
    ),
    call. = FALSE
  )
}

tree <- ape::read.tree(treefile)
branch_length <- if (show_branch_length) "branch.length" else "none"
plot <- ggtree::ggtree(tree, layout = layout, branch.length = branch_length)

if (show_tip_labels) {
  plot <- plot + ggtree::geom_tiplab(
    size = tip_font_size,
    align = layout == "rectangular",
    linetype = "dotted",
    linesize = 0.25
  )
}

if (show_support) {
  plot <- plot + ggtree::geom_text2(
    ggplot2::aes(subset = !isTip, label = label),
    hjust = -0.3,
    size = max(2, tip_font_size * 0.8),
    color = "#9a5a35"
  )
}

plot <- plot +
  ggtree::theme_tree2() +
  ggplot2::theme(
    plot.background = ggplot2::element_rect(fill = "white", color = NA),
    panel.background = ggplot2::element_rect(fill = "white", color = NA),
    axis.text.x = ggplot2::element_text(size = 8, color = "#5f6f66"),
    axis.ticks.x = ggplot2::element_line(color = "#d6e0d8"),
    axis.line.x = ggplot2::element_line(color = "#d6e0d8")
  )

ggplot2::ggsave(
  paste0(output_prefix, ".png"),
  plot,
  width = plot_width,
  height = plot_height,
  dpi = 180,
  bg = "white"
)
ggplot2::ggsave(
  paste0(output_prefix, ".pdf"),
  plot,
  width = plot_width,
  height = plot_height,
  bg = "white"
)

if (requireNamespace("svglite", quietly = TRUE)) {
  ggplot2::ggsave(
    paste0(output_prefix, ".svg"),
    plot,
    width = plot_width,
    height = plot_height,
    bg = "white"
  )
}

cat("ggtree plot generated for", length(tree$tip.label), "tips\n")
