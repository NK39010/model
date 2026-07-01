# Resolves MAFFT executables for bundled and system installations.
from __future__ import annotations

import platform
import shutil
from dataclasses import dataclass
from pathlib import Path

from app.core.config import resource_path
from app.tools.errors import ToolDependencyError
from app.tools.mafft.modes import DEFAULT_MAFFT_VERSION


@dataclass(frozen=True)
class MafftBinary:
    path: Path
    version: str
    source: str
    binaries_dir: Path | None = None


def resolve_mafft_binary(version: str = DEFAULT_MAFFT_VERSION) -> MafftBinary:
    system_name = platform.system()
    platform_key = _platform_key(system_name)
    bundled = _bundled_entrypoint(platform_key, version)
    if bundled.is_file():
        return MafftBinary(
            path=bundled,
            version=version,
            source="bundled",
            binaries_dir=_bundled_binaries_dir(platform_key, version),
        )

    system_binary = shutil.which("mafft")
    if system_binary:
        return MafftBinary(path=Path(system_binary), version=version, source="system")

    raise ToolDependencyError(
        "MAFFT executable was not found.",
        {
            "version": version,
            "searched": [str(bundled), "PATH: mafft"],
            "install": "Bundle MAFFT under backend/vendor/mafft or install mafft on PATH.",
        },
    )


def _platform_key(system_name: str) -> str:
    if system_name == "Windows":
        return "windows"
    if system_name == "Darwin":
        return "macos"
    if system_name == "Linux":
        return "linux"
    raise ToolDependencyError("MAFFT is not configured for this operating system.", {"platform": system_name})


def _bundled_entrypoint(platform_key: str, version: str) -> Path:
    if platform_key == "windows":
        return resource_path(f"backend/vendor/mafft/windows/{version}/mafft-win/mafft.bat")
    if platform_key == "macos":
        return resource_path(f"backend/vendor/mafft/macos/{version}/mafft-mac/mafftdir/bin/mafft")
    return resource_path(f"backend/vendor/mafft/{platform_key}/{version}/mafft")


def _bundled_binaries_dir(platform_key: str, version: str) -> Path | None:
    if platform_key == "macos":
        return resource_path(f"backend/vendor/mafft/macos/{version}/mafft-mac/mafftdir/libexec")
    return None
