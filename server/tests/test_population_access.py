import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.services.account_store import AccountStore
from app.services.admin_auth import SESSION_COOKIE_NAME, hash_password, issue_session
from app.services.admin_session_store import AdminSessionStore

ENDPOINT = "/api/population/regions"


class PopulationAccessTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        accounts = AccountStore(root / "accounts.db")
        accounts.create("kim", hash_password("long-enough-password"), "user")
        sessions = AdminSessionStore(root / "sessions.db")
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        db_sessions = sessionmaker(bind=engine)

        def test_db():
            with db_sessions() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.addCleanup(app.dependency_overrides.clear)
        for target, value in [
            ("app.services.admin_auth.ACCOUNT_STORE", accounts),
            ("app.services.admin_auth.SESSION_STORE", sessions),
            ("app.services.admin_auth.ADMIN_SESSION_SECRET", "test-secret"),
            ("app.services.admin_auth.ADMIN_USERNAME", "root"),
            ("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"),
            ("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 600),
        ]:
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.session_value = issue_session("kim")

    def test_public_by_default(self):
        with patch("app.api.population.REQUIRE_LOGIN_FOR_POPULATION_DATA", False):
            self.assertNotEqual(self.client.get(ENDPOINT).status_code, 401)

    def test_login_required_when_configured(self):
        with patch("app.api.population.REQUIRE_LOGIN_FOR_POPULATION_DATA", True):
            self.assertEqual(self.client.get(ENDPOINT).status_code, 401)
            self.client.cookies.set(SESSION_COOKIE_NAME, self.session_value)
            self.assertNotEqual(self.client.get(ENDPOINT).status_code, 401)


if __name__ == "__main__":
    unittest.main()
