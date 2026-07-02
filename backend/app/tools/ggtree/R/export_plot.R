export_plot_files <- function(plot, output_prefix, style) {
  ggplot2::ggsave(
    paste0(output_prefix, ".png"),
    plot,
    width = style$plot_width,
    height = style$plot_height,
    dpi = style$dpi,
    bg = style$background_color
  )
  ggplot2::ggsave(
    paste0(output_prefix, ".pdf"),
    plot,
    width = style$plot_width,
    height = style$plot_height,
    bg = style$background_color
  )

  if (requireNamespace("svglite", quietly = TRUE)) {
    ggplot2::ggsave(
      paste0(output_prefix, ".svg"),
      plot,
      width = style$plot_width,
      height = style$plot_height,
      bg = style$background_color
    )
  }
}
