# Verifies the IQ-TREE virtualenv linking helper.
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import link_iqtree_to_venv


class LinkIqtreeScriptTest(unittest.TestCase):
    def test_link_script_installs_executable_into_virtualenv(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            source = root / "source-iqtree3"
            source.write_text("#!/bin/sh\n", encoding="utf-8")
            source.chmod(0o755)
            venv = root / ".venv"

            with patch.dict(os.environ, {"VIRTUAL_ENV": str(venv)}, clear=True):
                target = link_iqtree_to_venv.venv_bin_dir(root) / link_iqtree_to_venv.target_name(source)
                link_iqtree_to_venv.install_link(source, target)

            self.assertTrue(target.exists())
            self.assertTrue(os.access(target, os.X_OK))

    def test_select_windows_asset_prefers_64_bit_zip(self) -> None:
        release = {
            "assets": [
                {"name": "iqtree-3.1.3-macOS.zip", "browser_download_url": "https://example.test/mac.zip"},
                {"name": "iqtree-3.1.3-Windows-x86_64.zip", "browser_download_url": "https://example.test/win.zip"},
            ]
        }

        asset = link_iqtree_to_venv.select_windows_asset(release)

        self.assertIsNotNone(asset)
        assert asset is not None
        self.assertEqual(asset["browser_download_url"], "https://example.test/win.zip")

    def test_find_executable_discovers_nested_windows_binary(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            executable = root / "iqtree" / "bin" / "iqtree3.exe"
            executable.parent.mkdir(parents=True)
            executable.write_text("binary", encoding="utf-8")

            self.assertEqual(link_iqtree_to_venv.find_executable(root, ("iqtree3.exe",)), executable.resolve())


if __name__ == "__main__":
    unittest.main()
