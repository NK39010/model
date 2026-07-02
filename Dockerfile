# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
COPY frontend/react/package.json frontend/react/pnpm-lock.yaml ./react/
RUN pnpm install --frozen-lockfile

COPY frontend/react ./react
RUN pnpm run build


FROM r-base:4.4.3 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV UV_LINK_MODE=copy
ENV BIO_TOOL_HOST=0.0.0.0
ENV BIO_TOOL_PORT=8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        iqtree \
        libcurl4-openssl-dev \
        libfontconfig1-dev \
        libfreetype6-dev \
        libfribidi-dev \
        libharfbuzz-dev \
        libjpeg-dev \
        libpng-dev \
        libssl-dev \
        libtiff-dev \
        libxml2-dev \
        mafft \
        python3 \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.7.12 /uv /uvx /bin/

WORKDIR /app

COPY scripts/install_r_packages.R scripts/install_r_packages.R
RUN Rscript scripts/install_r_packages.R

COPY pyproject.toml uv.lock ./
COPY backend ./backend
RUN uv sync --frozen --no-dev

COPY frontend/index.html ./frontend/index.html
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data/results \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app/data

USER appuser

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "api"]
