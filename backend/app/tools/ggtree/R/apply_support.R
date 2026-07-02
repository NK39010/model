apply_node_points <- function(plot, style) {
  if (!style$show_nodes) return(plot)

  plot + ggtree::geom_point2(
    ggplot2::aes(subset = !isTip),
    size = max(0.6, style$branch_width * 1.7),
    shape = 21,
    fill = style$branch_color,
    color = style$background_color,
    stroke = 0.25
  )
}

apply_support_labels <- function(plot, tree, style) {
  if (!style$show_support || style$support_mode == "none") return(plot)

  plot$data$support_numeric <- suppressWarnings(as.numeric(sub("/.*$", "", plot$data$label)))
  support_override_nodes <- override_nodes(tree, style$support_overrides)

  if (style$support_mode == "dots") {
    plot <- plot + ggtree::geom_point2(
      ggplot2::aes(subset = !isTip & !(node %in% support_override_nodes) & !is.na(support_numeric) & support_numeric >= style$support_threshold),
      size = max(1.2, style$support_font_size * 0.75),
      shape = 21,
      fill = style$support_color,
      color = style$background_color,
      stroke = 0.25
    )
  } else if (style$support_mode == "low") {
    plot <- plot + ggtree::geom_text2(
      ggplot2::aes(subset = !isTip & !(node %in% support_override_nodes) & !is.na(support_numeric) & support_numeric < style$support_threshold, label = label),
      hjust = -0.25,
      vjust = -0.25,
      size = style$support_font_size,
      family = "Times",
      color = style$support_color
    )
  } else {
    plot <- plot + ggtree::geom_text2(
      ggplot2::aes(subset = !isTip & !(node %in% support_override_nodes) & !is.na(support_numeric) & support_numeric >= style$support_threshold, label = label),
      hjust = -0.25,
      vjust = -0.25,
      size = style$support_font_size,
      family = "Times",
      color = style$support_color
    )
  }

  apply_support_overrides(plot, tree, style)
}

apply_support_overrides <- function(plot, tree, style) {
  if (length(style$support_overrides) == 0) return(plot)

  for (clade_id in names(style$support_overrides)) {
    item <- style$support_overrides[[clade_id]]
    if (is_false(item$visible)) next
    node <- clade_node(tree, clade_id)
    if (is.na(node)) next
    support_data <- plot$data[!plot$data$isTip & plot$data$node == node & !is.na(plot$data$support_numeric), , drop = FALSE]
    if (nrow(support_data) == 0) next
    mode <- as.character(if (is.null(item$mode)) style$support_mode else item$mode)
    color <- override_color(item, "color", style$support_color)
    size <- override_number(item, "font_size", style$support_font_size)

    if (mode == "dots") {
      plot <- plot + ggtree::geom_point2(
        data = support_data,
        size = max(1.2, size * 0.75),
        shape = 21,
        fill = color,
        color = style$background_color,
        stroke = 0.25
      )
    } else {
      plot <- plot + ggtree::geom_text2(
        data = support_data,
        ggplot2::aes(label = label),
        hjust = -0.25,
        vjust = -0.25,
        size = size,
        family = "Times",
        color = color
      )
    }
  }

  plot
}
