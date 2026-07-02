clade_tips <- function(tree, clade_id) {
  if (!startsWith(clade_id, "clade:")) return(character())
  tips <- strsplit(sub("^clade:", "", clade_id), "\\|", fixed = FALSE)[[1]]
  tips[tips %in% tree$tip.label]
}

clade_node <- function(tree, clade_id) {
  tips <- clade_tips(tree, clade_id)
  if (length(tips) == 0) return(NA_integer_)
  if (length(tips) == 1) return(match(tips, tree$tip.label))
  node <- tryCatch(ape::getMRCA(tree, tips), error = function(error) NA_integer_)
  if (is.null(node)) NA_integer_ else node
}

override_nodes <- function(tree, overrides) {
  if (length(overrides) == 0) return(integer())
  unique(stats::na.omit(vapply(names(overrides), function(clade_id) clade_node(tree, clade_id), integer(1))))
}
