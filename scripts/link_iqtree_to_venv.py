#!/usr/bin/env python3
"""Link or copy an IQ-TREE executable into the uv virtual environment."""
from __future__ import annotations

import json
import os
import shutil
import stat
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import Any


EXECUTABLE_NAMES = ("iqtree3", "iqtree2", "iqtree")
IQTREE_RELEASE_API = "https://api.github.com/repos/iqtree/iqtree3/releases/latest"


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    source = find_iqtree(root)
    if source is None and os.name == "nt":
        print("IQ-TREE was not found; downloading the latest Windows release...")
        source = install_windows_iqtree(root)
    if source is None:
        print(
            "Could not find IQ-TREE. Install iqtree3/iqtree2, set IQTREE_BINARY in .env, "
            "or run this script on Windows to auto-download the release zip.",
            file=sys.stderr,
        )
        return 1

    bin_dir = venv_bin_dir(root)
    bin_dir.mkdir(parents=True, exist_ok=True)
    target = bin_dir / target_name(source)
    install_link(source, target)
    print(f"IQ-TREE linked into uv environment: {target} -> {source}")
    return 0


def find_iqtree(root: Path) -> Path | None:
    env = read_env_file(root / ".env")
    configured = env.get("IQTREE_BINARY") or os.environ.get("IQTREE_BINARY")
    if configured:
        path = Path(configured).expanduser()
        if path.exists():
            return path.resolve()

    for name in EXECUTABLE_NAMES:
        resolved = shutil.which(name)
        if resolved:
            return Path(resolved).resolve()

    return None


def install_windows_iqtree(root: Path, release_api: str = IQTREE_RELEASE_API) -> Path:
    tools_dir = root / ".venv" / "tools" / "iqtree"
    downloads_dir = tools_dir / "downloads"
    extract_dir = tools_dir / "current"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    extract_dir.mkdir(parents=True, exist_ok=True)

    release = fetch_release(release_api)
    asset = select_windows_asset(release)
    if asset is None:
        raise RuntimeError("Could not find a Windows IQ-TREE zip asset in the latest GitHub release.")

    asset_name = str(asset["name"])
    archive = downloads_dir / asset_name
    download_file(str(asset["browser_download_url"]), archive)

    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        package.extractall(extract_dir)

    executable = find_executable(extract_dir, ("iqtree3.exe", "iqtree2.exe", "iqtree.exe"))
    if executable is None:
        raise RuntimeError(f"Could not find iqtree executable after extracting {asset_name}.")
    return executable


def fetch_release(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "bio-tool-backend"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def select_windows_asset(release: dict[str, Any]) -> dict[str, Any] | None:
    for asset in release.get("assets", []):
        name = str(asset.get("name", ""))
        lowered = name.lower()
        if not lowered.endswith(".zip"):
            continue
        if "win" not in lowered and "windows" not in lowered:
            continue
        if "arm" in lowered:
            continue
        if not any(token in lowered for token in ("64", "x64", "x86_64", "win")):
            continue
        if not asset.get("browser_download_url"):
            continue
        return asset
    return None


def download_file(url: str, destination: Path) -> None:
    with urllib.request.urlopen(url, timeout=300) as response:
        with destination.open("wb") as file_handle:
            shutil.copyfileobj(response, file_handle)


def find_executable(root: Path, names: tuple[str, ...]) -> Path | None:
    wanted = {name.lower() for name in names}
    for path in root.rglob("*"):
        if path.is_file() and path.name.lower() in wanted:
            return path.resolve()
    return None


def read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = clean_env_value(value)
    return values


def clean_env_value(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        return cleaned[1:-1]
    return cleaned


def venv_bin_dir(root: Path) -> Path:
    venv = Path(os.environ.get("VIRTUAL_ENV", root / ".venv"))
    return venv / ("Scripts" if os.name == "nt" else "bin")


def target_name(source: Path) -> str:
    suffix = ".exe" if source.suffix.lower() == ".exe" or os.name == "nt" else ""
    return f"iqtree3{suffix}"


def install_link(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() or target.is_symlink():
        target.unlink()

    try:
        target.symlink_to(source)
    except OSError:
        shutil.copy2(source, target)

    if os.name != "nt":
        mode = target.stat().st_mode
        target.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


if __name__ == "__main__":
    raise SystemExit(main())
