import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.account_requests import REQUEST_TTL_SECONDS, AccountRequestStore
from app.services.account_store import AccountStore
from app.services.admin_auth import (
    SESSION_COOKIE_NAME,
    hash_password,
    issue_session,
    password_fingerprint,
    read_session,
)
from app.services.admin_session_store import AdminSessionStore
from app import reset_admin_password
from app.services.admin_login_limit import LoginRateLimiter


PASSWORD = "long-enough-password"


class SessionFingerprintTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.accounts = AccountStore(root / "accounts.db")
        self.sessions = AdminSessionStore(root / "sessions.db")
        self.accounts.create("kim", hash_password(PASSWORD), "user")
        targets = {
            "app.services.admin_auth.ACCOUNT_STORE": self.accounts,
            "app.services.admin_auth.SESSION_STORE": self.sessions,
            "app.services.admin_auth.ADMIN_SESSION_SECRET": "secret",
            "app.services.admin_auth.ADMIN_USERNAME": "root",
            "app.services.admin_auth.ADMIN_PASSWORD_HASH": "configured",
            "app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS": 600,
        }
        for target, value in targets.items():
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_session_is_rejected_after_password_changes(self):
        value = issue_session("kim")
        self.assertIsNotNone(read_session(value))
        self.accounts.update("kim", password_hash=hash_password("another-password"))
        self.assertIsNone(read_session(value))

    def test_session_issued_with_stale_fingerprint_is_rejected(self):
        # 로그인 검증 뒤 비밀번호가 바뀌고 세션이 만들어지는 경쟁을 재현합니다.
        stale_fp = password_fingerprint(self.accounts.get("kim").password_hash)
        self.accounts.update("kim", password_hash=hash_password("another-password"))
        value = issue_session("kim", pwd_fp=stale_fp)
        self.assertIsNone(read_session(value))

    def test_fingerprint_is_not_the_hash(self):
        fp = password_fingerprint(self.accounts.get("kim").password_hash)
        self.assertNotIn("pbkdf2", fp)
        self.assertEqual(len(fp), 32)


class PendingRequestExpiryTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.store = AccountRequestStore(Path(self._tmp.name) / "accounts.db")

    def test_requests_older_than_seven_days_are_removed(self):
        self.store.add_signup("old_one", hash_password(PASSWORD))
        stale = int(time.time()) - REQUEST_TTL_SECONDS - 60
        db = sqlite3.connect(self.store.db_path)
        try:
            with db:
                db.execute("UPDATE account_requests SET created_at = ? WHERE username = ?",
                           (stale, "old_one"))
        finally:
            db.close()
        self.store.add_signup("fresh_one", hash_password(PASSWORD))
        names = [item.username for item in self.store.list("signup")]
        self.assertEqual(names, ["fresh_one"])


class DocsAndRecoveryTests(unittest.TestCase):
    def test_api_docs_are_hidden_by_default(self):
        self.assertIsNone(app.docs_url)
        self.assertIsNone(app.openapi_url)

    def test_recovery_resets_password_and_revokes_sessions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            accounts = AccountStore(root / "accounts.db")
            sessions = AdminSessionStore(root / "sessions.db")
            accounts.create("root", hash_password("old-password-1"), "admin")
            with patch("app.services.admin_auth.ACCOUNT_STORE", accounts), \
                 patch("app.services.admin_auth.SESSION_STORE", sessions), \
                 patch("app.services.admin_auth.ADMIN_SESSION_SECRET", "secret"), \
                 patch("app.services.admin_auth.ADMIN_USERNAME", "root"), \
                 patch("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"), \
                 patch("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 600), \
                 patch("app.reset_admin_password.ACCOUNT_STORE", accounts), \
                 patch("app.reset_admin_password.SESSION_STORE", sessions):
                value = issue_session("root")
                self.assertIsNotNone(read_session(value))
                reset_admin_password.restore_admin("root", "brand-new-pass-1")
                self.assertIsNone(read_session(value))
                account = accounts.get("root")
                self.assertEqual(account.role, "admin")
                self.assertTrue(account.is_active)
                from app.services.admin_auth import authenticate
                self.assertTrue(authenticate("root", "brand-new-pass-1"))
                self.assertFalse(authenticate("root", "old-password-1"))

    def test_recovery_rejects_short_passwords(self):
        with self.assertRaises(ValueError):
            reset_admin_password.restore_admin("root", "short")


if __name__ == "__main__":
    unittest.main()
