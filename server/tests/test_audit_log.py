import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app import reset_admin_password
from app.main import app
from app.services.account_requests import AccountRequestStore
from app.services.account_store import AccountStore
from app.services.admin_auth import hash_password
from app.services.admin_login_limit import LoginRateLimiter
from app.services.admin_session_store import AdminSessionStore
from app.services.audit_log import AuditStore

PASSWORD = "long-enough-password"


class AuditAndCanonicalNameTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.accounts = AccountStore(root / "accounts.db")
        self.requests = AccountRequestStore(root / "accounts.db")
        self.sessions = AdminSessionStore(root / "sessions.db")
        self.audit = AuditStore(root / "audit.db")
        self.accounts.create("root", hash_password(PASSWORD), "admin")
        self.accounts.create("ops", hash_password(PASSWORD), "admin")
        self.accounts.create("kim", hash_password(PASSWORD), "user")
        for target, value in [
            ("app.services.audit_log.AUDIT_STORE", self.audit),
            ("app.services.admin_auth.ACCOUNT_STORE", self.accounts),
            ("app.api.admin.ACCOUNT_STORE", self.accounts),
            ("app.reset_admin_password.ACCOUNT_STORE", self.accounts),
            ("app.services.admin_auth.ACCOUNT_REQUESTS", self.requests),
            ("app.api.admin.ACCOUNT_REQUESTS", self.requests),
            ("app.services.admin_auth.SESSION_STORE", self.sessions),
            ("app.api.admin.SESSION_STORE", self.sessions),
            ("app.reset_admin_password.SESSION_STORE", self.sessions),
            ("app.services.admin_auth.ADMIN_SESSION_SECRET", "test-secret"),
            ("app.api.admin.ADMIN_SESSION_SECRET", "test-secret"),
            ("app.services.admin_auth.ADMIN_USERNAME", "root"),
            ("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"),
            ("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 600),
            ("app.api.admin.login_limiter", LoginRateLimiter(root / "attempts.db", max_attempts=1000)),
        ]:
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def login(self, username, password=PASSWORD):
        return self.client.post("/api/admin/login", json={"username": username, "password": password})

    def actions(self):
        return [(e.actor, e.action, e.target) for e in self.audit.recent(50)]

    # 대문자 로그인

    def test_uppercase_login_gets_canonical_session_name(self):
        self.assertEqual(self.login("ROOT").status_code, 200)
        self.assertEqual(self.client.get("/api/admin/session").json()["username"], "root")

    def test_uppercase_login_cannot_delete_or_deactivate_self(self):
        self.login("ROOT")
        self.assertEqual(self.client.delete("/api/admin/users/root").status_code, 409)
        self.assertEqual(self.client.patch("/api/admin/users/root", json={"is_active": False}).status_code, 409)
        self.assertIsNotNone(self.accounts.get("root"))
        self.assertTrue(self.accounts.get("root").is_active)

    def test_user_wide_revoke_covers_uppercase_login(self):
        self.login("KIM")
        self.assertEqual(self.client.get("/api/admin/session").status_code, 200)
        self.sessions.revoke_user("kim")
        self.assertEqual(self.client.get("/api/admin/session").status_code, 401)

    # 작업 기록

    def test_login_success_and_failure_are_recorded(self):
        self.login("root", "wrong-password-x")
        self.login("root")
        self.assertIn(("root", "login_failed", None), self.actions())
        self.assertIn(("root", "login_success", None), self.actions())

    def test_admin_actions_record_who_did_what_to_whom(self):
        self.login("root")
        self.client.post("/api/admin/users", json={"username": "park_01", "password": PASSWORD})
        self.client.patch("/api/admin/users/kim", json={"is_active": False})
        self.client.delete("/api/admin/users/PARK_01")
        actions = self.actions()
        self.assertIn(("root", "user_create", "park_01"), actions)
        self.assertIn(("root", "user_deactivate", "kim"), actions)
        self.assertIn(("root", "user_delete", "park_01"), actions)

    def test_refused_actions_are_not_recorded_as_done(self):
        self.login("root")
        self.client.delete("/api/admin/users/root")
        self.assertNotIn(("root", "user_delete", "root"), self.actions())

    def test_secrets_never_reach_the_log(self):
        self.requests.add_reset("kim")
        self.login("root")
        code = self.client.post("/api/admin/requests/reset/kim/approve").json()["code"]
        self.client.patch("/api/admin/users/kim", json={"password": "brand-new-password"})
        db = sqlite3.connect(self.audit.db_path)
        try:
            dumped = " ".join(str(row) for row in db.execute("SELECT * FROM audit_log"))
        finally:
            db.close()
        self.assertIn("reset_code_issue", dumped)
        for secret in (code, "brand-new-password", PASSWORD):
            self.assertNotIn(secret, dumped)

    def test_only_admins_can_read_the_log(self):
        self.assertEqual(self.client.get("/api/admin/audit").status_code, 401)
        self.login("kim")
        self.assertEqual(self.client.get("/api/admin/audit").status_code, 403)
        self.client.post("/api/admin/logout")
        self.client.cookies.clear()
        self.login("root")
        items = self.client.get("/api/admin/audit").json()["items"]
        self.assertEqual(items[0]["action"], "login_success")

    def test_log_write_failure_does_not_break_the_action(self):
        self.login("root")
        broken = MagicMock()
        broken.add.side_effect = sqlite3.OperationalError("disk full")
        with patch("app.services.audit_log.AUDIT_STORE", broken):
            self.assertEqual(self.client.delete("/api/admin/users/kim").status_code, 200)
        self.assertIsNone(self.accounts.get("kim"))

    def test_server_recovery_is_recorded(self):
        reset_admin_password.restore_admin("root", "brand-new-pass-1")
        self.assertIn(("server-cli", "admin_recovery", "root"), self.actions())


if __name__ == "__main__":
    unittest.main()
