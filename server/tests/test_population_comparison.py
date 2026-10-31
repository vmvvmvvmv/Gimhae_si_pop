import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import PopulationMonthly, Region
from app.repositories.population_repository import shift_month
from app.services.population_query_service import RegionNotFound, read_comparison


class PopulationComparisonTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([
            Region(id=1, level="admin", region_code="4825025000", region_name="행정동", is_active=True),
            Region(id=2, level="legal", region_code="4825025000", region_name="법정동", is_active=True),
            Region(id=3, level="admin", region_code="4825025999", region_name="비활성", is_active=False),
        ])
        self.db.add_all([
            PopulationMonthly(region_id=1, stats_ym="202412", population=100),
            PopulationMonthly(region_id=1, stats_ym="202501", population=120),
            PopulationMonthly(region_id=2, stats_ym="202412", population=50),
            PopulationMonthly(region_id=2, stats_ym="202501", population=40),
            PopulationMonthly(region_id=3, stats_ym="202412", population=999),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_same_code_is_separated_by_admin_and_legal_level(self):
        admin = read_comparison(self.db, "admin", "4825025000", "202412", "202501")
        legal = read_comparison(self.db, "legal", "4825025000", "202412", "202501")
        self.assertEqual((admin["change"], admin["changeRate"]), (20, 20.0))
        self.assertEqual((legal["change"], legal["changeRate"]), (-10, -20.0))
        self.assertEqual(admin["regionName"], "행정동")
        self.assertEqual(legal["regionName"], "법정동")

    def test_missing_month_and_inactive_region_are_not_filled_by_other_rows(self):
        result = read_comparison(self.db, "admin", "4825025000", "202411", "202501")
        self.assertIsNone(result["base"])
        self.assertIsNone(result["change"])
        self.assertFalse(result["meta"]["dataAvailable"])
        with self.assertRaises(RegionNotFound):
            read_comparison(self.db, "admin", "4825025999", "202411", "202501")

    def test_zero_base_population_has_no_percentage(self):
        self.db.add(PopulationMonthly(region_id=1, stats_ym="202502", population=0))
        self.db.add(PopulationMonthly(region_id=1, stats_ym="202503", population=5))
        self.db.commit()
        result = read_comparison(self.db, "admin", "4825025000", "202502", "202503")
        self.assertEqual(result["change"], 5)
        self.assertIsNone(result["changeRate"])

    def test_invalid_or_equal_month_is_rejected(self):
        for base, target in (("202500", "202501"), ("202501", "202513"),
                             ("202501", "202501")):
            with self.subTest(base=base, target=target), self.assertRaises(ValueError):
                read_comparison(self.db, "admin", "4825025000", base, target)

    def test_month_shift_crosses_year_boundary(self):
        self.assertEqual(shift_month("202501", -1), "202412")
        self.assertEqual(shift_month("202501", -12), "202401")
        self.assertEqual(shift_month("202512", 1), "202601")


if __name__ == "__main__":
    unittest.main()
