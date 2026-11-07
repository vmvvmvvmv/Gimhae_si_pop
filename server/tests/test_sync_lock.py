import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from app.db import DATA_DIR
from app.services.sync_lock import SyncAlreadyRunning, sync_lock


class SyncLockTests(unittest.TestCase):
    def test_same_process_cannot_acquire_twice(self):
        directory = DATA_DIR / ".test-sync-lock"
        directory.mkdir(parents=True, exist_ok=True)
        try:
            with patch("app.services.sync_lock.DATA_DIR", directory):
                with sync_lock("test"):
                    with self.assertRaises(SyncAlreadyRunning):
                        with sync_lock("test"):
                            pass
        finally:
            shutil.rmtree(directory, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
