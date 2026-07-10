prepare_tip_label_data <- function(plot, style) {
  plot$data$tip_display_label <- plot$data$label
  plot$data$tip_species_label <- ""
  custom_tip_names <- character()

  if (length(style$tip_metadata) > 0) {
    for (tip_name in names(style$tip_metadata)) {
      item <- style$tip_metadata[[tip_name]]
      row_index <- which(plot$data$isTip & plot$data$label == tip_name)
      if (length(row_index) == 0) next
      sequence_label <- item$sequence_label
      species <- item$species
      if (!is.null(sequence_label) && nzchar(as.character(sequence_label))) {
        plot$data$tip_display_label[row_index] <- as.character(sequence_label)
      }
      if (!is.null(species) && nzchar(as.character(species))) {
        plot$data$tip_species_label[row_index] <- as.character(species)
      }
    }
  }

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

radial_ring_text_data <- function(tip_rows, radius, angle_offset = 0) {
  ring <- tip_rows
  ring$x <- radius
  ring$ring_degree <- round((ring$angle + angle_offset) %% 360)
  ring$label_angle <- ring$ring_degree
  ring$label_hjust <- 0

  left_side <- ring$ring_degree > 90 & ring$ring_degree < 270
  ring$label_angle[left_side] <- (ring$ring_degree[left_side] + 180) %% 360
  ring$label_hjust[left_side] <- 1
  ring
}

add_radial_ring_labels <- function(plot, ring, label_column, size, color, fontface = "plain") {
  plot + ggplot2::geom_text(
    data = ring,
    ggplot2::aes(
      x = x,
      y = y,
      label = .data[[label_column]],
      angle = label_angle,
      hjust = label_hjust
    ),
    size = size,
    family = "Times",
    fontface = fontface,
    color = color,
    inherit.aes = FALSE
  )
}

apply_tip_labels <- function(plot, style) {
  if (!style$show_tip_labels) return(plot)

  prepared <- prepare_tip_label_data(plot, style)
  plot <- prepared$plot
  radial_layout <- style$layout %in% c("circular", "fan")

  if (radial_layout) {
    tip_rows <- plot$data[plot$data$isTip, , drop = FALSE]
    max_tip_x <- max(tip_rows$x, na.rm = TRUE)
    sequence_radius <- max_tip_x + style$tip_label_offset
    sequence_ring <- radial_ring_text_data(tip_rows, sequence_radius, style$tip_label_angle)
    plot <- add_radial_ring_labels(
      plot,
      sequence_ring,
      "tip_display_label",
      style$tip_font_size,
      style$tip_label_color
    )
    if (style$show_species_labels && any(nzchar(tip_rows$tip_species_label))) {
      species_radius <- sequence_radius + style$species_label_offset
      species_ring <- radial_ring_text_data(tip_rows, species_radius, style$tip_label_angle)
      plot <- add_radial_ring_labels(
        plot,
        species_ring,
        "tip_species_label",
        style$species_font_size,
        style$species_label_color,
        "italic"
      )
    }
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
