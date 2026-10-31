import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import (
    NationalAdministrativeArea,
    NationalAdministrativePopulationMonthly,
    PopulationMonthly,
    Region,
)
from app.repositories.population_repository import get_similar_admin_density
from app.services.national_admin_matching import match_population_code, population_name_index


class NationalAdminMatchingTests(unittest.TestCase):
    def test_spelling_and_parent_variants_match_only_one_code(self):
        rows = [
            ("1111067000", "서울특별시 종로구 창신제1동"),
            ("4111156000", "경기도 장안구 파장동"),
            ("3611025000", "세종특별자치시 세종특별자치시 조치원읍"),
            ("1120065000", "서울특별시 성동구 성수1가제1동"),
        ]
        index = population_name_index(rows)
        codes = {code for code, _ in rows}
        self.assertEqual(match_population_code("11010670", "서울특별시 종로구 창신1동", codes, index), "1111067000")
        self.assertEqual(match_population_code("31011540", "경기도 수원시 장안구 파장동", codes, index), "4111156000")
        self.assertEqual(match_population_code("29010110", "세종특별자치시 세종시 조치원읍", codes, index), "3611025000")
        self.assertEqual(match_population_code("11040650", "서울특별시 성동구 성수1가1동", codes, index), "1120065000")

    def test_ambiguous_or_split_region_is_not_guessed(self):
        rows = [
            ("A", "전북특별자치도 전주시 덕진구 금암1동"),
            ("B", "전북특별자치도 전주시 덕진구 금암2동"),
            ("C", "경기도 장안구 파장동"),
            ("D", "경기도 장안구 파장동"),
        ]
        index = population_name_index(rows)
        codes = {code for code, _ in rows}
        self.assertIsNone(match_population_code("35012721", "전북특별자치도 전주시 덕진구 금암동", codes, index))
        self.assertIsNone(match_population_code("31011540", "경기도 수원시 장안구 파장동", codes, index))

    def test_density_query_uses_resolved_population(self):
        engine = create_engine("sqlite://", poolclass=StaticPool)
        try:
            Base.metadata.create_all(engine)
            with Session(engine) as db:
                db.add(Region(id=1, level="admin", region_code="4825051000",
                              region_name="김해시 내외동", area_m2=2_000_000, is_active=True))
                db.add(PopulationMonthly(region_id=1, stats_ym="202501", population=1000))
                db.add(NationalAdministrativeArea(boundary_year=2025, region_code="11010670",
                                                  region_name="서울특별시 종로구 창신1동", area_km2=2.1))
                db.add(NationalAdministrativePopulationMonthly(
                    region_code="1111067000", region_name="서울특별시 종로구 창신제1동",
                    stats_ym="202501", population=2100))
                db.commit()
                result = get_similar_admin_density(db, "4825051000", "202501", 10, 0.2)
            self.assertIsNotNone(result)
            self.assertEqual(result["matches"][0]["population"], 2100)
            self.assertEqual(result["comparison"]["sampleCount"], 1)
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
