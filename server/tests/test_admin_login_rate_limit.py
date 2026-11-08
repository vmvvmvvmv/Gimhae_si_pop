from types import SimpleNamespace
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import HTTPException, Response
from starlette.requests import Request

from app.api.admin import LoginRequest, admin_login
from app.services.admin_login_limit import LoginRateLimiter


class LoginRateLimitTests(unittest.TestCase):
    def test_concurrent_requests_admit_only_five_checks(self):
        with TemporaryDirectory(dir=Path.cwd()) as directory:
            limiter = LoginRateLimiter(db_path=Path(directory) / "login.db")
            with ThreadPoolExecutor(max_workers=10) as executor:
                decisions = list(executor.map(
                    lambda _: limiter.reserve("client-a", now=100), range(10),
                ))
        self.assertEqual(decisions.count(0), 5)
        self.assertEqual(decisions.count(900), 5)

    def test_five_attempts_then_block_across_instances_until_expiry(self):
        with TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "login.db"
            limiter = LoginRateLimiter(db_path=path)
            for _ in range(5):
                self.assertEqual(limiter.reserve("client-a", now=100), 0)
            restarted = LoginRateLimiter(db_path=path)
            self.assertEqual(restarted.reserve("client-a", now=101), 900)
            self.assertEqual(restarted.reserve("client-a", now=102), 899)
            self.assertEqual(restarted.reserve("client-a", now=1001), 0)

    def test_success_clears_attempts_and_clients_are_independent(self):
        with TemporaryDirectory(dir=Path.cwd()) as directory:
            limiter = LoginRateLimiter(db_path=Path(directory) / "login.db")
            for _ in range(5):
                limiter.reserve("client-a", now=100)
            self.assertEqual(limiter.reserve("client-b", now=101), 0)
            limiter.clear("client-a")
            self.assertEqual(limiter.reserve("client-a", now=102), 0)

    def test_login_returns_retry_after_before_password_verification(self):
        request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})
        with patch("app.services.audit_log.AUDIT_STORE"), \
             patch("app.api.admin.admin_auth_configured", return_value=True), \
             patch("app.api.admin.login_limiter") as limiter, \
             patch("app.api.admin.authenticate_account") as authenticate:
            limiter.reserve.return_value = 60
            with self.assertRaises(HTTPException) as caught:
                admin_login(LoginRequest(username="admin", password="wrong"), Response(), request)
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.headers["Retry-After"], "60")
        authenticate.assert_not_called()

    def test_success_clears_client_attempts(self):
        request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})
        response = Response()
        with patch("app.services.audit_log.AUDIT_STORE"), \
             patch("app.api.admin.admin_auth_configured", return_value=True), \
             patch("app.api.admin.login_limiter") as limiter, \
             patch("app.api.admin.authenticate_account",
                   return_value=SimpleNamespace(password_hash="stub-hash")), \
             patch("app.services.admin_auth.issue_session", return_value="signed-session"):
            limiter.reserve.return_value = 0
            admin_login(LoginRequest(username="admin", password="correct"), response, request)
        self.assertEqual(limiter.clear.call_count, 2)
        self.assertIn("gimhae_admin_session", response.headers["set-cookie"])


if __name__ == "__main__":
    unittest.main()
