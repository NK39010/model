apply_tree_theme <- function(plot, style) {
  if (style$tree_theme == "axis") {
    plot <- plot + ggtree::theme_tree2()
  } else {
    plot <- plot + ggtree::theme_tree()
  }

  if (style$x_expand > 0 && "hexpand" %in% getNamespaceExports("ggtree")) {
    plot <- plot + ggtree::hexpand(style$x_expand)
  }

  plot <- plot +
    ggplot2::theme(
      text = ggplot2::element_text(family = "Times"),
      plot.background = ggplot2::element_rect(fill = style$background_color, color = NA),
      panel.background = ggplot2::element_rect(fill = style$background_color, color = NA),
      plot.margin = ggplot2::margin(5.5, style$right_margin, 5.5, 5.5),
      axis.text.x = ggplot2::element_text(family = "Times", size = 8, color = "#5f6f66"),
      axis.ticks.x = ggplot2::element_line(color = "#d6e0d8"),
      axis.line.x = ggplot2::element_line(color = "#d6e0d8")
    )

  if (style$tree_theme == "publication") {
    plot <- plot + ggplot2::theme(
      legend.position = "none",
      plot.title = ggplot2::element_blank()
    )
  }

  plot
}
