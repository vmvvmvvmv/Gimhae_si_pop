import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.account_requests import AccountRequestStore
from app.services.account_store import AccountStore
from app.services.admin_auth import SESSION_COOKIE_NAME, hash_password, issue_session, read_session
from app.services.admin_login_limit import LoginRateLimiter
from app.services.admin_session_store import AdminSessionStore
from app.services.audit_log import AuditStore

PASSWORD = "long-enough-password"


class UsernameChangeTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.accounts = AccountStore(root / "accounts.db")
        self.requests = AccountRequestStore(root / "accounts.db")
        self.sessions = AdminSessionStore(root / "sessions.db")
        self.accounts.create("root", hash_password(PASSWORD), "admin")
        self.accounts.create("kim", hash_password(PASSWORD), "user")
        self.accounts.create("lee", hash_password(PASSWORD), "user")
        targets = [
            ("app.services.audit_log.AUDIT_STORE", AuditStore(root / "audit.db")),
            ("app.services.admin_auth.ACCOUNT_STORE", self.accounts),
            ("app.api.auth.ACCOUNT_STORE", self.accounts),
            ("app.services.admin_auth.ACCOUNT_REQUESTS", self.requests),
            ("app.api.auth.ACCOUNT_REQUESTS", self.requests),
            ("app.services.admin_auth.SESSION_STORE", self.sessions),
            ("app.api.auth.SESSION_STORE", self.sessions),
            ("app.services.admin_auth.ADMIN_SESSION_SECRET", "test-secret"),
            ("app.services.admin_auth.ADMIN_USERNAME", "root"),
            ("app.api.auth.ADMIN_USERNAME", "root"),
            ("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"),
            ("app.api.auth.auth_limiter", LoginRateLimiter(root / "attempts.db")),
        ]
        for target, value in targets:
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def login_as(self, username, remember=False):
        self.client.cookies.set(SESSION_COOKIE_NAME, issue_session(username, remember=remember))

    def change(self, new_username, password=PASSWORD):
        return self.client.post(
            "/api/auth/username",
            json={"new_username": new_username, "current_password": password},
        )

    def test_rename_keeps_this_device_logged_in_and_ends_other_logins(self):
        other_device = issue_session("kim")
        self.requests.add_reset("kim")
        self.login_as("kim", remember=True)
        response = self.change("Park01")
        self.assertEqual(response.status_code, 200)
        self.assertIn("max-age", response.headers["set-cookie"].lower())
        self.assertIsNone(self.accounts.get("kim"))
        self.assertFalse(self.requests.exists("reset", "kim"))
        self.assertEqual(self.client.get("/api/admin/session").json()["username"], "park01")
        self.assertIsNone(read_session(other_device))

    def test_wrong_password_changes_nothing(self):
        self.login_as("kim")
        self.assertEqual(self.change("park01", "wrong").status_code, 400)
        self.assertIsNotNone(self.accounts.get("kim"))

    def test_duplicate_and_pending_names_are_rejected(self):
        self.requests.add_signup("waiting", "hash")
        self.login_as("kim")
        self.assertEqual(self.change("LEE").status_code, 409)
        self.assertEqual(self.change("waiting").status_code, 409)
        self.assertIsNotNone(self.accounts.get("kim"))

    def test_environment_admin_cannot_be_renamed(self):
        self.login_as("root")
        self.assertEqual(self.change("boss").status_code, 409)
        self.assertIsNotNone(self.accounts.get("root"))

    def test_limit_is_per_account_not_shared_by_one_office_ip(self):
        self.login_as("kim")
        statuses = [self.change("park01", "wrong").status_code for _ in range(6)]
        self.assertEqual(statuses, [400] * 5 + [429])
        self.client.cookies.clear()
        self.login_as("lee")
        self.assertEqual(self.change("park02", "wrong").status_code, 400)

    def test_anonymous_requests_from_one_ip_are_limited_per_username_first(self):
        for index in range(6):
            response = self.client.post(
                "/api/auth/password-reset/request", json={"username": f"user{index}"},
            )
            self.assertEqual(response.status_code, 404)
        statuses = [
            self.client.post("/api/auth/password-reset/request", json={"username": "ghost"}).status_code
            for _ in range(6)
        ]
        self.assertEqual(statuses, [404] * 5 + [429])

    def test_requires_login(self):
        self.assertEqual(self.change("park01").status_code, 401)
