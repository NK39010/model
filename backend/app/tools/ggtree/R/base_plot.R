make_base_plot <- function(tree, style) {
  branch_length <- if (style$show_branch_length) "branch.length" else "none"
  ggtree_args <- list(
    tree,
    layout = style$layout,
    branch.length = branch_length,
    color = style$branch_color,
    linewidth = style$branch_width
  )
  if (style$layout == "fan") {
    ggtree_args$open.angle <- style$open_angle
  }
  do.call(ggtree::ggtree, ggtree_args)
}

apply_clade_rotations <- function(plot, tree, style) {
  if (length(style$node_overrides) == 0 || !"rotate" %in% getNamespaceExports("ggtree")) return(plot)
  for (clade_id in names(style$node_overrides)) {
    item <- style$node_overrides[[clade_id]]
    if (!is_true(item$rotated)) next
    node <- clade_node(tree, clade_id)
    if (is.na(node)) next
    plot <- tryCatch(ggtree::rotate(plot, node = node), error = function(error) plot)
  }
  plot
}

apply_clade_collapses <- function(plot, tree, style) {
  if (length(style$node_overrides) == 0) return(plot)

  for (clade_id in names(style$node_overrides)) {
    item <- style$node_overrides[[clade_id]]
    node <- clade_node(tree, clade_id)
    if (is.na(node)) next
    if (is_true(item$collapsed) && "collapse" %in% getNamespaceExports("ggtree")) {
      plot <- tryCatch(ggtree::collapse(plot, node = node), error = function(error) plot)
    }
  }

  plot
}
