import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.audit_log import AuditStore
from app.services.account_requests import AccountRequestStore
from app.services.account_store import AccountStore
from app.services.admin_auth import SESSION_COOKIE_NAME, hash_password, issue_session
from app.services.admin_login_limit import LoginRateLimiter
from app.services.admin_session_store import AdminSessionStore

PASSWORD = "long-enough-password"


class AccountDeleteTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.accounts = AccountStore(root / "accounts.db")
        self.requests = AccountRequestStore(root / "accounts.db")
        self.sessions = AdminSessionStore(root / "sessions.db")
        self.accounts.create("root", hash_password(PASSWORD), "admin")
        self.accounts.create("kim", hash_password(PASSWORD), "user")
        targets = [
            ("app.services.audit_log.AUDIT_STORE", AuditStore(root / "audit.db")),
            ("app.services.admin_auth.ACCOUNT_STORE", self.accounts),
            ("app.api.admin.ACCOUNT_STORE", self.accounts),
            ("app.services.admin_auth.ACCOUNT_REQUESTS", self.requests),
            ("app.api.admin.ACCOUNT_REQUESTS", self.requests),
            ("app.services.admin_auth.SESSION_STORE", self.sessions),
            ("app.api.admin.SESSION_STORE", self.sessions),
            ("app.services.admin_auth.ADMIN_SESSION_SECRET", "test-secret"),
            ("app.services.admin_auth.ADMIN_USERNAME", "root"),
            ("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"),
            ("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 600),
            ("app.api.admin.login_limiter", LoginRateLimiter(root / "attempts.db")),
        ]
        for target, value in targets:
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def login_as(self, username):
        self.client.cookies.set(SESSION_COOKIE_NAME, issue_session(username))

    def test_admin_deletes_user_and_their_sessions_and_requests(self):
        self.requests.add_reset("kim")
        self.login_as("root")
        kim_session = issue_session("kim")
        response = self.client.delete("/api/admin/users/KIM")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(self.accounts.get("kim"))
        self.assertFalse(self.requests.exists("reset", "kim"))
        self.client.cookies.set(SESSION_COOKIE_NAME, kim_session)
        self.assertEqual(self.client.get("/api/admin/session").status_code, 401)

    def test_cannot_delete_yourself(self):
        self.login_as("root")
        self.assertEqual(self.client.delete("/api/admin/users/root").status_code, 409)
        self.assertIsNotNone(self.accounts.get("root"))

    def test_cannot_delete_last_active_admin(self):
        self.accounts.create("ops", hash_password(PASSWORD), "admin")
        self.login_as("ops")
        self.accounts.set_active("ops", True)
        # root를 지우면 ops만 남으므로 가능합니다. ops를 지우려면 root가 있어야 합니다.
        self.assertEqual(self.client.delete("/api/admin/users/root").status_code, 200)
        self.client.cookies.clear()
        self.login_as("ops")
        self.assertEqual(self.client.delete("/api/admin/users/ops").status_code, 409)

    def test_unknown_user_is_404(self):
        self.login_as("root")
        self.assertEqual(self.client.delete("/api/admin/users/nobody").status_code, 404)

    def test_regular_user_cannot_delete(self):
        self.login_as("kim")
        self.assertEqual(self.client.delete("/api/admin/users/root").status_code, 403)
        self.assertIsNotNone(self.accounts.get("root"))


if __name__ == "__main__":
    unittest.main()
