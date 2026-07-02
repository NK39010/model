apply_clade_highlights <- function(plot, tree, style) {
  if (length(style$node_overrides) == 0) return(plot)

  for (clade_id in names(style$node_overrides)) {
    item <- style$node_overrides[[clade_id]]
    if (!is_true(item$branch_highlight)) next
    node <- clade_node(tree, clade_id)
    if (is.na(node)) next

    if ("geom_hilight" %in% getNamespaceExports("ggtree")) {
      plot <- plot + ggtree::geom_hilight(
        node = node,
        fill = override_color(item, "branch_color", "#d87a33"),
        alpha = 0.18
      )
    }
    if ("geom_cladelab" %in% getNamespaceExports("ggtree")) {
      plot <- tryCatch(
        plot + ggtree::geom_cladelab(
          node = node,
          label = "",
          color = override_color(item, "branch_color", "#d87a33"),
          barsize = override_number(item, "branch_width", max(style$branch_width + 1.2, 1.8)),
          offset = 0
        ),
        error = function(error) plot
      )
    }
  }

  plot
}
