parse_plot_args <- function(args) {
  if (length(args) < 25) {
    stop(
      "Usage: plot_tree.R <treefile> <output_prefix> <layout> <tip_labels> <support> <branch_length> <font_size> <width> <height> <branch_width> <branch_color> <tip_color> <support_color> <background> <support_threshold> <dpi> <align_tip_labels> <tip_label_offset> <tip_label_angle> <support_mode> <support_font_size> <tree_theme> <x_expand> <right_margin> <open_angle> [style_json]",
      call. = FALSE
    )
  }

  list(
    treefile = args[[1]],
    output_prefix = args[[2]],
    style_path = if (length(args) >= 26) args[[26]] else "",
    defaults = list(
      layout = args[[3]],
      show_tip_labels = tolower(args[[4]]) == "true",
      show_support = tolower(args[[5]]) == "true",
      show_nodes = TRUE,
      show_branch_length = tolower(args[[6]]) == "true",
      tip_font_size = as.numeric(args[[7]]),
      plot_width = as.numeric(args[[8]]),
      plot_height = as.numeric(args[[9]]),
      branch_width = as.numeric(args[[10]]),
      branch_color = args[[11]],
      tip_label_color = args[[12]],
      support_color = args[[13]],
      background_color = args[[14]],
      support_threshold = as.numeric(args[[15]]),
      dpi = as.numeric(args[[16]]),
      align_tip_labels = tolower(args[[17]]) == "true",
      tip_label_offset = as.numeric(args[[18]]),
      tip_label_angle = as.numeric(args[[19]]),
      support_mode = args[[20]],
      support_font_size = as.numeric(args[[21]]),
      tree_theme = args[[22]],
      x_expand = as.numeric(args[[23]]),
      right_margin = as.numeric(args[[24]]),
      open_angle = as.numeric(args[[25]]),
      label_overrides = list(),
      support_overrides = list(),
      node_overrides = list()
    )
  )
}

required_plot_packages <- function(style_path) {
  packages <- c("ape", "ggplot2", "ggtree")
  if (nzchar(style_path) && file.exists(style_path)) {
    packages <- unique(c(packages, "jsonlite"))
  }
  packages
}

assert_plot_packages <- function(packages) {
  missing_packages <- packages[!vapply(packages, requireNamespace, logical(1), quietly = TRUE)]
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
}

read_frontend_style <- function(style_path) {
  if (!nzchar(style_path) || !file.exists(style_path)) {
    return(list())
  }
  jsonlite::fromJSON(style_path, simplifyVector = FALSE)
}

style_value <- function(style, name, default) {
  value <- style[[name]]
  if (is.null(value)) default else value
}

style_bool <- function(style, name, default) {
  value <- style_value(style, name, default)
  if (is.logical(value)) return(isTRUE(value))
  tolower(as.character(value)) %in% c("1", "true", "yes", "on")
}

style_number <- function(style, name, default) {
  value <- suppressWarnings(as.numeric(style_value(style, name, default)))
  ifelse(is.na(value), default, value)
}

normalize_style <- function(frontend_style, defaults) {
  list(
    layout = as.character(style_value(frontend_style, "layout", defaults$layout)),
    show_tip_labels = style_bool(frontend_style, "show_tip_labels", defaults$show_tip_labels),
    show_support = style_bool(frontend_style, "show_support", defaults$show_support),
    show_nodes = style_bool(frontend_style, "show_nodes", defaults$show_nodes),
    show_branch_length = style_bool(frontend_style, "show_branch_length", defaults$show_branch_length),
    align_tip_labels = style_bool(frontend_style, "align_tip_labels", defaults$align_tip_labels),
    tip_font_size = style_number(frontend_style, "tip_font_size", defaults$tip_font_size),
    plot_width = defaults$plot_width,
    plot_height = defaults$plot_height,
    tip_label_offset = style_number(frontend_style, "tip_label_offset", defaults$tip_label_offset),
    tip_label_angle = style_number(frontend_style, "tip_label_angle", defaults$tip_label_angle),
    branch_width = style_number(frontend_style, "branch_width", defaults$branch_width),
    branch_color = as.character(style_value(frontend_style, "branch_color", defaults$branch_color)),
    tip_label_color = as.character(style_value(frontend_style, "tip_label_color", defaults$tip_label_color)),
    support_mode = as.character(style_value(frontend_style, "support_mode", defaults$support_mode)),
    support_font_size = style_number(frontend_style, "support_font_size", defaults$support_font_size),
    support_color = as.character(style_value(frontend_style, "support_color", defaults$support_color)),
    background_color = as.character(style_value(frontend_style, "background_color", defaults$background_color)),
    support_threshold = style_number(frontend_style, "support_threshold", defaults$support_threshold),
    tree_theme = as.character(style_value(frontend_style, "tree_theme", defaults$tree_theme)),
    x_expand = style_number(frontend_style, "x_expand", defaults$x_expand),
    right_margin = style_number(frontend_style, "right_margin", defaults$right_margin),
    open_angle = style_number(frontend_style, "open_angle", defaults$open_angle),
    dpi = defaults$dpi,
    label_overrides = style_value(frontend_style, "label_overrides", list()),
    support_overrides = style_value(frontend_style, "support_overrides", list()),
    node_overrides = style_value(frontend_style, "node_overrides", list())
  )
}

is_true <- function(value) {
  if (is.null(value)) return(FALSE)
  if (is.logical(value)) return(isTRUE(value))
  tolower(as.character(value)) %in% c("1", "true", "yes", "on")
}

is_false <- function(value) {
  if (is.null(value)) return(FALSE)
  if (is.logical(value)) return(!isTRUE(value))
  tolower(as.character(value)) %in% c("0", "false", "no", "off")
}

override_number <- function(item, name, default) {
  value <- suppressWarnings(as.numeric(item[[name]]))
  ifelse(is.na(value), default, value)
}

override_color <- function(item, name, default) {
  value <- item[[name]]
  if (is.null(value) || !nzchar(as.character(value))) default else as.character(value)
}
