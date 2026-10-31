import json
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.main import ready
from app.models import PopulationMonthly, Region


class DeploymentReadinessTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_requires_both_administrative_and_legal_population(self):
        with self.sessions() as db:
            empty = ready(db)
            self.assertEqual(empty.status_code, 503)
            self.assertEqual(
                json.loads(empty.body)["missing_levels"], ["admin", "legal"],
            )

            db.add(Region(id=1, level="admin", region_code="4825025000",
                          region_name="행정동", is_active=True))
            db.add(PopulationMonthly(region_id=1, stats_ym="202601", population=1))
            db.commit()
            admin_only = ready(db)
            self.assertEqual(admin_only.status_code, 503)
            self.assertEqual(json.loads(admin_only.body)["missing_levels"], ["legal"])

            db.add(Region(id=2, level="legal", region_code="4825025000",
                          region_name="법정동", is_active=True))
            db.add(PopulationMonthly(region_id=2, stats_ym="202602", population=1))
            db.commit()
            complete = ready(db)
            self.assertEqual(complete.status_code, 200)
            self.assertEqual(json.loads(complete.body)["latest_months"], {
                "admin": "202601", "legal": "202602",
            })

    def test_missing_schema_is_not_ready(self):
        Base.metadata.drop_all(self.engine)
        with self.sessions() as db:
            with self.assertLogs("app.main", level="ERROR"):
                response = ready(db)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(json.loads(response.body), {"status": "not_ready"})


if __name__ == "__main__":
    unittest.main()
