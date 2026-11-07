import asyncio
import unittest
from contextlib import nullcontext
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.sync_population_range import sync_range


class SyncRangeFailureTests(unittest.TestCase):
    def run_month(self, results, from_month=8, to_month=8, saved_count=2):
        regions = [{"code": "a", "name": "A"}, {"code": "b", "name": "B"}]
        with patch("app.sync_population_range.MOIS_SERVICE_KEY", "test-key"), \
             patch("app.sync_population_range.load_regions", return_value=regions, create=True), \
             patch("app.sync_population_range.get_region_population_range", return_value=results), \
             patch("app.sync_population_range.SessionLocal.begin", return_value=nullcontext()) as transaction, \
             patch("app.sync_population_range.save_local_population_result", return_value=saved_count) as save, \
             patch("builtins.print") as output:
            try:
                asyncio.run(sync_range("admin", 2026, from_month, 2026, to_month, 0))
                failed = False
            except RuntimeError:
                failed = True
        return failed, transaction, save, output

    @staticmethod
    def complete_item(code):
        return {"regionCode": code, "sourceRowCount": 1, "ageSourceRowCount": 1}

    def test_partial_region_month_never_opens_write_transaction(self):
        result = {"202608": {"year": 2026, "month": 8,
                             "items": [self.complete_item("a")],
                             "meta": {"failedRegionCount": 1, "failedRegions": []}}}
        failed, transaction, save, _ = self.run_month(result)
        self.assertTrue(failed)
        transaction.assert_not_called()
        save.assert_not_called()

    def test_missing_age_rows_never_replaces_existing_month(self):
        item = self.complete_item("b")
        item["ageSourceRowCount"] = 0
        result = {"202608": {"year": 2026, "month": 8,
                             "items": [self.complete_item("a"), item],
                             "meta": {"failedRegionCount": 0, "failedRegions": []}}}
        failed, transaction, save, _ = self.run_month(result)
        self.assertTrue(failed)
        transaction.assert_not_called()
        save.assert_not_called()

    def test_missing_month_does_not_make_range_succeed(self):
        result = {"202608": {"year": 2026, "month": 8,
                             "items": [self.complete_item("a"), self.complete_item("b")],
                             "meta": {"failedRegionCount": 0, "failedRegions": []}}}
        failed, transaction, save, _ = self.run_month(result, 8, 9)
        self.assertTrue(failed)
        transaction.assert_called_once()
        save.assert_called_once()

    def test_complete_month_is_saved_once(self):
        result = {"202608": {"year": 2026, "month": 8,
                             "items": [self.complete_item("a"), self.complete_item("b")],
                             "meta": {"failedRegionCount": 0, "failedRegions": []}}}
        failed, transaction, save, _ = self.run_month(result)
        self.assertFalse(failed)
        transaction.assert_called_once()
        save.assert_called_once()

    def test_db_region_mismatch_fails_month(self):
        result = {"202608": {"year": 2026, "month": 8,
                             "items": [self.complete_item("a"), self.complete_item("b")],
                             "meta": {"failedRegionCount": 0, "failedRegions": []}}}
        failed, transaction, save, output = self.run_month(result, saved_count=1)
        self.assertTrue(failed)
        transaction.assert_called_once()
        save.assert_called_once()
        self.assertTrue(any("지역 저장 건수" in str(call) for call in output.call_args_list))

    def test_db_region_mismatch_rolls_back_writes(self):
        engine = create_engine("sqlite://")
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE marker (value INTEGER)"))
        sessions = sessionmaker(bind=engine)
        result = {"202608": {"year": 2026, "month": 8,
                             "items": [self.complete_item("a"), self.complete_item("b")],
                             "meta": {"failedRegionCount": 0, "failedRegions": []}}}

        def save_one(db, _result):
            db.execute(text("INSERT INTO marker (value) VALUES (1)"))
            return 1

        with patch("app.sync_population_range.MOIS_SERVICE_KEY", "test-key"), \
             patch("app.sync_population_range.load_regions", return_value=[{"code": "a"}, {"code": "b"}]), \
             patch("app.sync_population_range.get_region_population_range", return_value=result), \
             patch("app.sync_population_range.SessionLocal", sessions), \
             patch("app.sync_population_range.save_local_population_result", side_effect=save_one), \
             patch("builtins.print"):
            with self.assertRaisesRegex(RuntimeError, "동기화 실패"):
                asyncio.run(sync_range("admin", 2026, 8, 2026, 8, 0))

        with engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM marker")), 0)
        engine.dispose()

    def test_failed_regions_mark_job_failed_and_show_reason(self):
        result = {"202608": {
            "year": 2026, "month": 8, "items": [],
            "meta": {"failedRegionCount": 19, "failedRegions": [
                {"regionName": "진영읍", "regionCode": "4825025000", "error": "upstream timeout"},
            ]},
        }}
        with patch("app.sync_population_range.MOIS_SERVICE_KEY", "test-key"), \
             patch("app.sync_population_range.get_region_population_range", return_value=result), \
             patch("app.sync_population_range.SessionLocal.begin", return_value=nullcontext()), \
             patch("app.sync_population_range.save_local_population_result", return_value=0), \
             patch("builtins.print") as output:
            with self.assertRaisesRegex(RuntimeError, "동기화 실패"):
                asyncio.run(sync_range("admin", 2026, 8, 2026, 8, 0))
        self.assertTrue(any("upstream timeout" in str(call) for call in output.call_args_list))


if __name__ == "__main__":
    unittest.main()
