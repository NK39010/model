export_layout_json <- function(plot, tree, output_prefix) {
  data <- plot$data
  rows <- lapply(seq_len(nrow(data)), function(index) {
    row <- data[index, , drop = FALSE]
    list(r_node = as.integer(row$node[[1]]), r_parent = as.integer(row$parent[[1]]),
      x = as.numeric(row$x[[1]]), y = as.numeric(row$y[[1]]),
      angle = if ("angle" %in% names(row)) as.numeric(row$angle[[1]]) else 0,
      is_tip = isTRUE(row$isTip[[1]]),
      label = if (is.na(row$label[[1]])) "" else as.character(row$label[[1]]))
  })
  bounds <- list(x_min = min(data$x, na.rm = TRUE), x_max = max(data$x, na.rm = TRUE),
    y_min = min(data$y, na.rm = TRUE), y_max = max(data$y, na.rm = TRUE))
  jsonlite::write_json(list(version = 1, coordinate_system = "ggtree", bounds = bounds, nodes = rows),
    paste0(output_prefix, ".layout.json"), auto_unbox = TRUE, pretty = TRUE, na = "null")
}
