import csv
import unittest
from io import StringIO
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.population import download_population_export, population_export_preview
from app.db import Base
from app.models import PopulationMonthly, Region
from app.services.population_export_service import (
    NoExportData,
    population_export_csv,
    prepare_population_export,
)


class PopulationExportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)

        with self.sessions() as db:
            db.add_all([
                Region(id=1, level="admin", region_code="4825025000",
                       region_name="테스트동", area_m2=2_000_000, is_active=True),
                Region(id=2, level="admin", region_code="4825026000",
                       region_name="=위험한 이름", is_active=True),
                Region(id=3, level="legal", region_code="4825025000",
                       region_name="법정동", is_active=True),
                Region(id=4, level="admin", region_code="4825027000",
                       region_name="비활성", is_active=False),
            ])
            db.add_all([
                PopulationMonthly(region_id=1, stats_ym="202412", population=100,
                                  households=40, source="MOIS"),
                PopulationMonthly(region_id=1, stats_ym="202501", population=120,
                                  male_population=59, female_population=61,
                                  households=45, source="MOIS"),
                PopulationMonthly(region_id=1, stats_ym="202503", population=130,
                                  households=48, source="MOIS"),
                PopulationMonthly(region_id=2, stats_ym="202503", population=50,
                                  source="MOIS"),
                PopulationMonthly(region_id=3, stats_ym="202503", population=999),
                PopulationMonthly(region_id=4, stats_ym="202503", population=999),
            ])
            db.commit()

    def tearDown(self):
        self.engine.dispose()

    @staticmethod
    def request_from(host: str = "127.0.0.1") -> Request:
        return Request({
            "type": "http",
            "method": "GET",
            "path": "/api/population/export/preview",
            "headers": [],
            "query_string": b"",
            "client": (host, 1234),
            "server": ("testserver", 80),
            "scheme": "http",
        })

    def test_region_range_uses_stored_months_and_blank_missing_change(self):
        with self.sessions() as db:
            result = prepare_population_export(
                db, "admin", "region",
                ["population", "areaKm2", "populationDensity",
                 "previousMonthChange", "previousMonthChangeRate"],
                "4825025000", "202501", "202503", None,
            )
        self.assertEqual(result["count"], 2)  # 2월은 저장되지 않았음
        self.assertEqual(result["columns"][:4], ["조회년월", "지역 구분", "지역 코드", "지역명"])
        self.assertEqual(result["rows"][0][0], "2025-01")
        self.assertEqual(result["rows"][0][4:9], [120, 2.0, 60.0, 20, 20.0])
        self.assertEqual(result["rows"][1][0], "2025-03")
        self.assertEqual(result["rows"][1][7:9], [None, None])
        self.assertEqual(result["rows"][0][-1], None)
        self.assertNotIn("인구 자료 출처", result["columns"])
        self.assertNotIn("면적 자료 출처", result["columns"])

    def test_month_scope_excludes_other_level_and_inactive_regions(self):
        with self.sessions() as db:
            result = prepare_population_export(
                db, "admin", "month", ["population"],
                None, None, None, "202503",
            )
        self.assertEqual(result["count"], 2)
        self.assertEqual({row[2] for row in result["rows"]},
                         {"4825025000", "4825026000"})

        raw = population_export_csv(result)
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
        parsed = list(csv.reader(StringIO(raw.decode("utf-8-sig"))))
        self.assertEqual(parsed[0][-1], "총인구(명)")
        self.assertIn("'=위험한 이름", [row[3] for row in parsed[1:]])

    def test_multiple_selected_regions_are_exported_once_each(self):
        with self.sessions() as db:
            result = prepare_population_export(
                db, "admin", "region", ["population"],
                None, "202501", "202503", None,
                ["4825025000", "4825026000", "4825025000"],
            )
            legal = prepare_population_export(
                db, "legal", "region", ["population"],
                None, "202503", "202503", None,
                ["4825025000", "4825026000"],
            )
        self.assertEqual(result["count"], 3)
        self.assertEqual(
            [(row[2], row[0]) for row in result["rows"]],
            [("4825025000", "2025-01"),
             ("4825026000", "2025-03"),
             ("4825025000", "2025-03")],
        )
        self.assertEqual(legal["count"], 1)
        self.assertEqual(legal["rows"][0][4], 999)

    def test_invalid_request_and_empty_data(self):
        with self.sessions() as db:
            for fields, start, end in [
                (["unknown"], "202501", "202503"),
                ([], "202501", "202503"),
                (["population"], "202513", "202513"),
                (["population"], "202503", "202501"),
            ]:
                with self.subTest(fields=fields, start=start, end=end):
                    with self.assertRaises(ValueError):
                        prepare_population_export(
                            db, "admin", "region", fields,
                            "4825025000", start, end, None,
                        )
            with self.assertRaises(NoExportData):
                prepare_population_export(
                    db, "admin", "month", ["population"],
                    None, None, None, "202502",
                )
            with self.assertRaises(ValueError):
                prepare_population_export(
                    db, "admin", "region", ["population"],
                    None, "202501", "202503", None, ["invalid"],
                )

    def test_preview_and_csv_endpoint_share_columns(self):
        with self.sessions() as db:
            args = dict(
                level="admin", scope="month", fields=["population", "households"],
                region_code=None, region_codes=None,
                from_ym=None, to_ym=None, stats_ym="202503", db=db,
                request=self.request_from(),
            )
            preview = population_export_preview(**args)
            self.assertEqual(preview["count"], 2)

            download = download_population_export(**args)
            self.assertEqual(download.status_code, 200)
            self.assertIn("attachment", download.headers["content-disposition"])
            parsed = list(csv.reader(StringIO(download.body.decode("utf-8-sig"))))
            self.assertEqual(parsed[0], preview["columns"])
            self.assertEqual(parsed[0][0], "조회년월")
            self.assertEqual(parsed[1][0], "2025-03")
            self.assertTrue(all("출처" not in column for column in parsed[0]))
            self.assertEqual(len(parsed), preview["count"] + 1)

            with self.assertRaises(HTTPException) as raised:
                population_export_preview(**{**args, "stats_ym": "202513"})
            self.assertEqual(raised.exception.status_code, 400)

    def test_preview_rejects_export_over_5000_rows(self):
        with self.sessions() as db:
            region = db.get(Region, 1)
            population = db.query(PopulationMonthly).filter_by(
                region_id=1,
                stats_ym="202503",
            ).one()
            with patch(
                "app.services.population_export_service.list_export_population",
                return_value=[(region, population)] * 5001,
            ):
                with self.assertRaises(HTTPException) as raised:
                    population_export_preview(
                        request=self.request_from("large-export-client"),
                        level="admin",
                        scope="month",
                        fields=["population"],
                        region_code=None,
                        region_codes=None,
                        from_ym=None,
                        to_ym=None,
                        stats_ym="202503",
                        db=db,
                    )
        self.assertEqual(raised.exception.status_code, 413)

    def test_export_rate_limit_rejects_sixth_request_from_same_ip(self):
        args = dict(
            level="admin", scope="month", fields=["population"],
            region_code=None, region_codes=None,
            from_ym=None, to_ym=None, stats_ym="202503",
        )
        with self.sessions() as db:
            for index in range(5):
                result = population_export_preview(
                    **args,
                    db=db,
                    request=self.request_from("rate-limit-client"),
                )
                self.assertEqual(result["count"], 2, index)
            with self.assertRaises(HTTPException) as raised:
                population_export_preview(
                    **args,
                    db=db,
                    request=self.request_from("rate-limit-client"),
                )
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.headers["Retry-After"], "60")


if __name__ == "__main__":
    unittest.main()
