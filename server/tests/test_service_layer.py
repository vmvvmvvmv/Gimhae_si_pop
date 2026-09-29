import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import DevelopmentNotice, Facility
from app.services.development_sync_service import replace_development_notices
from app.sync_vworld_facilities import REQUIRED_TRANSIT_STATIONS, validate_transit_coverage


class ServiceLayerApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)

        def test_db():
            with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.engine.dispose()

    def test_transit_sync_rejects_missing_official_station(self):
        rows = [{"name": name} for name in REQUIRED_TRANSIT_STATIONS - {"불암역"}]
        with self.assertRaisesRegex(RuntimeError, "불암역"):
            validate_transit_coverage(rows)
        validate_transit_coverage(rows + [{"name": "불암역"}])

    def test_facility_quality_rules_and_response_shape(self):
        with self.sessions() as db:
            db.add_all([
                Facility(
                    source="VWORLD", source_id=f"MARKET:{name}",
                    category="MARKET", name=name, latitude=35.2, longitude=128.9,
                )
                for name in ("동상시장", "삼방시장점 주점")
            ])
            db.add_all([
                Facility(
                    source="VWORLD", source_id=f"BRIDGE:{name}",
                    category="BRIDGE", name=name, latitude=35.2, longitude=128.9,
                )
                for name in ("낙동강대교", "투다리")
            ])
            db.commit()

        response = self.client.get(
            "/api/facilities", params=[("category", "MARKET"), ("category", "BRIDGE")]
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 2)
        self.assertEqual(
            {item["name"] for item in payload["items"]}, {"동상시장", "낙동강대교"}
        )
        self.assertEqual(payload["meta"]["categories"], ["MARKET", "BRIDGE"])

    def test_hospital_quality_applies_to_already_stored_rows(self):
        names = (
            "세계로동물종합병원",
            "갑을의료재단갑을장유병원",
            "의료법인갑을의료재단갑을장유병원",
            "김해보건소",
            "김해시보건소",
        )
        with self.sessions() as db:
            db.add_all([
                Facility(
                    source="VWORLD", source_id=f"HOSPITAL:{index}",
                    category="HOSPITAL", name=name,
                    latitude=35.2, longitude=128.9,
                    road_address="분성로 227" if name == "김해시보건소" else None,
                )
                for index, name in enumerate(names)
            ])
            db.commit()

        response = self.client.get("/api/facilities", params={"category": "HOSPITAL"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 2)
        self.assertEqual(
            {item["name"] for item in response.json()["items"]},
            {"갑을의료재단갑을장유병원", "김해시보건소"},
        )

    def test_school_park_and_transit_quality_applies_to_existing_rows(self):
        samples = (
            ("SCHOOL", "진영장등초등학교", 35.3126, 128.7307),
            ("SCHOOL", "진영장등초중학교", 35.3126, 128.7308),
            ("PARK", "e편한세상102동앞공원", 35.1935, 128.8091),
            ("PARK", "E편한세상102동앞공원", 35.1936, 128.8092),
            ("TRANSIT", "활천역", 35.2279, 128.9024),
        )
        with self.sessions() as db:
            db.add_all([
                Facility(
                    source="VWORLD", source_id=f"{category}:{index}",
                    category=category, name=name,
                    latitude=latitude, longitude=longitude,
                )
                for index, (category, name, latitude, longitude) in enumerate(samples)
            ])
            db.commit()

        response = self.client.get("/api/facilities", params=[
            ("category", "SCHOOL"), ("category", "PARK"), ("category", "TRANSIT"),
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 3)
        self.assertEqual(
            {item["name"] for item in response.json()["items"]},
            {"진영장등초등학교", "E편한세상102동앞공원", "인제대(활천)역"},
        )

    def test_development_notice_only_exposes_verified_official_url(self):
        with self.sessions() as db:
            db.add(DevelopmentNotice(
                source="GIMHAE_UPIS", source_id="notice-1", notice_number="2025-1",
                title="개발계획", notice_type_code="A", notice_type="고시",
                notice_date="2025-01-01", stage="ACTIVE", stage_label="진행",
                source_url="https://example.com/notice", fetched_at=datetime.now(timezone.utc),
            ))
            db.commit()

        response = self.client.get("/api/development/notices")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"][0]["sourceUrl"], "")

    def test_development_notice_exposes_verified_eum_url(self):
        official_url = (
            "https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=638912"
        )
        with self.sessions() as db:
            db.add(DevelopmentNotice(
                source="GIMHAE_UPIS", source_id="notice-eum", notice_number="2026-369",
                title="개발계획", notice_type_code="A", notice_type="고시",
                notice_date="2026-07-30", organization_name="경상남도",
                stage="ACTIVE", stage_label="진행", source_url=official_url,
                fetched_at=datetime.now(timezone.utc),
            ))
            db.commit()

        response = self.client.get("/api/development/notices")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"][0]["sourceUrl"], official_url)

    def test_development_notice_exposes_verified_gyeongnam_url(self):
        official_url = (
            "https://minwon.gyeongnam.go.kr/citynet/jsp/sap/"
            "SAPGosiBizProcess.do?command=searchDetail&flag=gosiGL&"
            "gosiGbn=N&sno=55047&svp=Y"
        )
        with self.sessions() as db:
            db.add(DevelopmentNotice(
                source="GIMHAE_UPIS", source_id="notice-gyeongnam",
                notice_number="2026-369", title="개발계획",
                notice_type_code="A", notice_type="고시",
                notice_date="2026-07-30", organization_name="경상남도",
                stage="ACTIVE", stage_label="진행", source_url=official_url,
                fetched_at=datetime.now(timezone.utc),
            ))
            db.commit()

        response = self.client.get("/api/development/notices")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"][0]["sourceUrl"], official_url)

    def test_population_validation_and_missing_month_contract(self):
        response = self.client.get(
            "/api/population/regions", params={"level": "admin", "year": 2025, "month": 12}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["meta"]["dataAvailable"], False)
        self.assertEqual(response.json()["items"], [])

        response = self.client.get(
            "/api/population/comparison",
            params={"region_code": "4825025000", "base_ym": "202501", "target_ym": "202501"},
        )
        self.assertEqual(response.status_code, 400)

    def test_national_and_floating_contracts(self):
        self.assertEqual(self.client.get("/api/national-population").status_code, 404)
        self.assertEqual(self.client.get("/api/national-density").status_code, 404)
        response = self.client.get("/api/floating-population/availability")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["months"], [])

    def test_disabled_live_proxy_keeps_404_contract(self):
        with patch("app.services.mois_proxy_service.ENABLE_LIVE_MOIS_PROXY", False):
            response = self.client.get("/api/population")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json()["detail"], "실시간 원천 API 프록시는 비활성화되어 있습니다."
        )

    def test_development_sync_rolls_back_the_whole_business_unit(self):
        fetched_at = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            db.add(DevelopmentNotice(
                source="GIMHAE_UPIS", source_id="existing", notice_number="2025-1",
                title="기존 고시", notice_type_code="A", notice_type="고시",
                notice_date="2025-01-01", stage="ACTIVE", stage_label="진행",
                source_url="https://example.com/existing", fetched_at=fetched_at,
                is_active=True,
            ))

        with self.assertRaisesRegex(RuntimeError, "강제 실패"):
            with self.sessions.begin() as db:
                replace_development_notices(
                    db,
                    from_date="2025-01-01",
                    to_date="2025-12-31",
                    notices=[{
                        "source_id": "new",
                        "notice_number": "2025-2",
                        "title": "신규 고시",
                        "notice_type_code": "A",
                        "notice_type": "고시",
                        "notice_date": "2025-02-01",
                        "organization_code": "48250",
                        "organization_name": "김해시",
                        "summary": "",
                        "stage": "ACTIVE",
                        "stage_label": "진행",
                        "source_url": "https://example.com/new",
                        "fetched_at": fetched_at,
                    }],
                )
                raise RuntimeError("강제 실패")

        with self.sessions() as db:
            existing = db.scalar(
                select(DevelopmentNotice).where(
                    DevelopmentNotice.source_id == "existing",
                ),
            )
            new_row = db.scalar(
                select(DevelopmentNotice).where(
                    DevelopmentNotice.source_id == "new",
                ),
            )
            self.assertIsNotNone(existing)
            self.assertTrue(existing.is_active)
            self.assertIsNone(new_row)

    def test_database_error_response_hides_internal_details(self):
        with patch(
            "app.api.population.read_stored_population",
            side_effect=SQLAlchemyError("secret database detail"),
        ):
            response = self.client.get("/api/population/regions")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.json(),
            {"detail": "데이터를 처리하는 중 오류가 발생했습니다."},
        )
        self.assertNotIn("secret", response.text)


if __name__ == "__main__":
    unittest.main()
