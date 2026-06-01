# PyInstaller build spec for the Windows desktop/server bundle.
from __future__ import annotations

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules


ROOT = Path.cwd()


a = Analysis(
    [str(ROOT / "backend" / "app" / "main.py")],
    pathex=[str(ROOT / "backend")],
    binaries=[],
    datas=[
        (str(ROOT / "frontend" / "index.html"), "frontend"),
        *collect_data_files("Bio.Align"),
    ],
    hiddenimports=[
        *collect_submodules("app"),
        *collect_submodules("skimage"),
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="BioToolBackend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="BioToolBackend",
)
