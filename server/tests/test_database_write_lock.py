import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import asyncio

from app.services.sync_lock import SyncAlreadyRunning, database_write_lock, sync_lock
from app.sync_population_history import sync_history
from app.import_admin_csv import main as import_admin_csv_main
from app.import_national_admin_areas import import_areas
from app.sync_kosis_admin_population_range import main as sync_kosis_range_main
from app.sync_sgis_admin_area_range import sync_year


class DatabaseWriteLockTests(unittest.TestCase):
    def test_history_sync_cannot_start_during_admin_sync(self):
        with sync_lock("database"):
            with self.assertRaises(SyncAlreadyRunning):
                sync_history(2026, 8, 2026, 8, 0)

    def test_csv_import_cannot_start_during_admin_sync(self):
        with patch("sys.argv", ["import_admin_csv"]), sync_lock("database"):
            with self.assertRaises(SyncAlreadyRunning):
                import_admin_csv_main()

    def test_sgis_area_import_cannot_start_during_admin_sync(self):
        with sync_lock("database"):
            with self.assertRaises(SyncAlreadyRunning):
                import_areas(Path("unused.geojson"), 2026, "adm_cd", "adm_nm", None, "SGIS", "EPSG:5179")

    def test_kosis_range_cannot_start_during_admin_sync(self):
        with sync_lock("database"):
            with self.assertRaises(SyncAlreadyRunning):
                sync_kosis_range_main()

    def test_sgis_lock_conflict_is_not_retried_as_api_error(self):
        with TemporaryDirectory() as directory, \
             patch("app.sync_sgis_admin_area_range.download_national_admin_areas", return_value={"features": []}), \
             patch("app.sync_sgis_admin_area_range.get_default_output_path", return_value=Path(directory) / "area.geojson"), \
             patch("app.sync_sgis_admin_area_range.import_areas", side_effect=SyncAlreadyRunning("database busy")), \
             patch("app.sync_sgis_admin_area_range.asyncio.sleep") as sleep:
            with self.assertRaises(SyncAlreadyRunning):
                asyncio.run(sync_year(2026, 0, 2))
        sleep.assert_not_called()

    def test_wrapped_write_does_not_start_while_database_sync_runs(self):
        calls = []

        @database_write_lock
        def write(value):
            calls.append(value)
            return value

        with sync_lock("database"):
            with self.assertRaises(SyncAlreadyRunning):
                write(1)
        self.assertEqual(calls, [])
        self.assertEqual(write(2), 2)
        self.assertEqual(calls, [2])


if __name__ == "__main__":
    unittest.main()
