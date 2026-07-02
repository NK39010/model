prepare_tip_label_data <- function(plot, style) {
  plot$data$tip_display_label <- plot$data$label
  custom_tip_names <- character()

  if (length(style$label_overrides) == 0) {
    return(list(plot = plot, custom_tip_names = custom_tip_names))
  }

  for (tip_name in names(style$label_overrides)) {
    item <- style$label_overrides[[tip_name]]
    row_index <- which(plot$data$isTip & plot$data$label == tip_name)
    if (length(row_index) == 0) next
    if (is_false(item$visible)) {
      plot$data$tip_display_label[row_index] <- ""
    }
    if (!is.null(item$color) || !is.null(item$font_size) || !is.null(item$offset) || !is.null(item$angle) || is_true(item$visible)) {
      plot$data$tip_display_label[row_index] <- ""
      custom_tip_names <- unique(c(custom_tip_names, tip_name))
    }
  }

  list(plot = plot, custom_tip_names = custom_tip_names)
}

apply_tip_labels <- function(plot, style) {
  if (!style$show_tip_labels) return(plot)

  prepared <- prepare_tip_label_data(plot, style)
  plot <- prepared$plot
  radial_layout <- style$layout %in% c("circular", "fan")

  if (radial_layout) {
    plot$data$angle <- plot$data$angle + style$tip_label_angle
    plot <- plot + ggtree::geom_tiplab2(
      ggplot2::aes(label = tip_display_label),
      size = style$tip_font_size,
      family = "Times",
      color = style$tip_label_color,
      offset = style$tip_label_offset
    )
  } else {
    plot <- plot + ggtree::geom_tiplab(
      ggplot2::aes(label = tip_display_label),
      size = style$tip_font_size,
      family = "Times",
      color = style$tip_label_color,
      align = style$align_tip_labels,
      offset = style$tip_label_offset,
      angle = 0,
      linetype = "dotted",
      linesize = 0.2
    )
  }

  for (tip_name in prepared$custom_tip_names) {
    item <- style$label_overrides[[tip_name]]
    if (is_false(item$visible)) next
    tip_data <- plot$data[plot$data$isTip & plot$data$label == tip_name, , drop = FALSE]
    if (nrow(tip_data) == 0) next
    if (radial_layout) {
      tip_data$angle <- tip_data$angle - style$tip_label_angle + override_number(item, "angle", style$tip_label_angle)
      plot <- plot + ggtree::geom_tiplab2(
        data = tip_data,
        ggplot2::aes(label = label),
        size = override_number(item, "font_size", style$tip_font_size),
        family = "Times",
        color = override_color(item, "color", style$tip_label_color),
        offset = override_number(item, "offset", style$tip_label_offset)
      )
    } else {
      plot <- plot + ggtree::geom_tiplab(
        data = tip_data,
        ggplot2::aes(label = label),
        size = override_number(item, "font_size", style$tip_font_size),
        family = "Times",
        color = override_color(item, "color", style$tip_label_color),
        align = style$align_tip_labels,
        offset = override_number(item, "offset", style$tip_label_offset),
        angle = override_number(item, "angle", 0),
        linetype = "dotted",
        linesize = 0.2
      )
    }
  }

  plot
}
