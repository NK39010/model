# Verifies local runtime configuration loading.
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.core.config import load_runtime_env


class RuntimeConfigTest(unittest.TestCase):
    def test_load_runtime_env_reads_quoted_windows_path(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            env_file = Path(tempdir) / ".env"
            env_file.write_text(
                'IQTREE_BINARY="C:\\Program Files\\IQ-TREE\\iqtree3.exe"\n',
                encoding="utf-8",
            )

            with patch.dict(os.environ, {}, clear=True):
                load_runtime_env(env_file)
                self.assertEqual(os.environ["IQTREE_BINARY"], "C:\\Program Files\\IQ-TREE\\iqtree3.exe")

    def test_load_runtime_env_does_not_override_existing_environment(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            env_file = Path(tempdir) / ".env"
            env_file.write_text("IQTREE_BINARY=/tmp/from-file\n", encoding="utf-8")

            with patch.dict(os.environ, {"IQTREE_BINARY": "/tmp/from-env"}, clear=True):
                load_runtime_env(env_file)
                self.assertEqual(os.environ["IQTREE_BINARY"], "/tmp/from-env")


if __name__ == "__main__":
    unittest.main()
