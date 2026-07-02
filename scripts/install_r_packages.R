options(
  repos = c(CRAN = "https://cloud.r-project.org"),
  Ncpus = max(1L, parallel::detectCores(logical = FALSE))
)

cran_packages <- c("ape", "BiocManager", "ggplot2", "svglite")
missing_cran <- cran_packages[!vapply(cran_packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing_cran) > 0) {
  install.packages(missing_cran)
}

if (!requireNamespace("ggtree", quietly = TRUE)) {
  BiocManager::install("ggtree", ask = FALSE, update = FALSE)
}

required_packages <- c("ape", "ggplot2", "ggtree")
missing_packages <- required_packages[!vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing_packages) > 0) {
  stop("R package installation failed: ", paste(missing_packages, collapse = ", "))
}

if (!requireNamespace("svglite", quietly = TRUE)) {
  message("Optional package svglite is unavailable; PNG and PDF output remain enabled.")
}
