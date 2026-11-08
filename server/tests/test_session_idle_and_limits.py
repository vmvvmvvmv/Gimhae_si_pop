import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, Response
from starlette.requests import Request

from app.api.admin import ACCOUNT_MAX_LOGIN_ATTEMPTS, LoginRequest, admin_login
from app.services.account_store import AccountStore
from app.services.admin_auth import hash_password, issue_session, read_session
from app.services.admin_login_limit import LoginRateLimiter
from app.services.admin_session_store import AdminSessionStore


class IdleSessionTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.accounts = AccountStore(root / "accounts.db")
        self.sessions = AdminSessionStore(root / "sessions.db")
        self.accounts.create("kim", hash_password("long-enough-password"), "user")
        for target, value in [
            ("ACCOUNT_STORE", self.accounts),
            ("SESSION_STORE", self.sessions),
            ("ADMIN_SESSION_SECRET", "secret"),
            ("ADMIN_USERNAME", "root"),
            ("ADMIN_PASSWORD_HASH", "configured"),
            ("ADMIN_SESSION_TTL_SECONDS", 10_000),
            ("ADMIN_SESSION_IDLE_SECONDS", 600),
        ]:
            patcher = patch(f"app.services.admin_auth.{target}", value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_session_expires_after_idle_time(self):
        value = issue_session("kim", issued_at=1000)
        self.assertIsNotNone(read_session(value, now=1500))
        self.assertIsNone(read_session(value, now=2200))
        # 만료된 세션은 삭제되어, 이후 시각을 되돌려도 살아나지 않습니다.
        self.assertIsNone(read_session(value, now=1100))

    def test_activity_extends_the_idle_window(self):
        value = issue_session("kim", issued_at=1000)
        for now in (1500, 2000, 2500, 3000):
            self.assertIsNotNone(read_session(value, now=now))


class AccountLoginLimitTests(unittest.TestCase):
    def _request(self, ip):
        return Request({"type": "http", "client": (ip, 1234), "headers": []})

    def test_account_is_limited_across_many_ips_in_any_case(self):
        with tempfile.TemporaryDirectory() as directory:
            limiter = LoginRateLimiter(Path(directory) / "attempts.db")
            with patch("app.services.audit_log.AUDIT_STORE"), \
                 patch("app.api.admin.login_limiter", limiter), \
                 patch("app.api.admin.ADMIN_SESSION_SECRET", "secret"), \
                 patch("app.api.admin.admin_auth_configured", return_value=True), \
                 patch("app.api.admin.authenticate_account", return_value=None):
                for attempt in range(ACCOUNT_MAX_LOGIN_ATTEMPTS):
                    name = "ROOT" if attempt % 2 else "root"
                    with self.assertRaises(HTTPException) as caught:
                        admin_login(LoginRequest(username=name, password="wrong"), Response(), self._request(f"10.0.0.{attempt}"))
                    self.assertEqual(caught.exception.status_code, 401)
                with self.assertRaises(HTTPException) as caught:
                    admin_login(LoginRequest(username="root", password="wrong"), Response(), self._request("10.0.1.1"))
                self.assertEqual(caught.exception.status_code, 429)
                # 다른 계정은 영향을 받지 않습니다.
                with self.assertRaises(HTTPException) as caught:
                    admin_login(LoginRequest(username="kim", password="wrong"), Response(), self._request("10.0.1.2"))
                self.assertEqual(caught.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
