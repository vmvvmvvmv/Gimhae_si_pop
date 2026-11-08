import unittest
from unittest.mock import patch

import tempfile
from pathlib import Path

from app.services.admin_auth import (
    hash_password,
    issue_session,
    read_session,
    revoke_session,
    verify_password,
)
from app.services.account_store import AccountStore
from app.services.admin_session_store import AdminSessionStore


class AdminAuthTests(unittest.TestCase):
    def setUp(self):
        # 실제 DB 대신 임시 세션 저장소를 씁니다.
        self._tmp = tempfile.TemporaryDirectory()
        store = AdminSessionStore(Path(self._tmp.name) / "sessions.db")
        patcher = patch("app.services.admin_auth.SESSION_STORE", store)
        patcher.start()
        self.addCleanup(patcher.stop)
        accounts = AccountStore(Path(self._tmp.name) / "accounts.db")
        account_patcher = patch("app.services.admin_auth.ACCOUNT_STORE", accounts)
        account_patcher.start()
        self.addCleanup(account_patcher.stop)
        self.accounts = accounts
        self.accounts.create("admin", hash_password("unused-password"), "admin")
        self.addCleanup(self._tmp.cleanup)

    def test_password_hash_is_not_reversible_and_verifies(self):
        encoded = hash_password("correct horse battery staple")
        self.assertNotEqual(encoded, "correct horse battery staple")
        self.assertTrue(verify_password("correct horse battery staple", encoded))
        self.assertFalse(verify_password("wrong", encoded))

    def test_session_signature_and_expiry(self):
        with patch("app.services.admin_auth.ADMIN_USERNAME", "admin"), \
             patch("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"), \
             patch("app.services.admin_auth.ADMIN_SESSION_SECRET", "secret"), \
             patch("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 60):
            value = issue_session("admin", issued_at=100)
            self.assertEqual(read_session(value, now=120).username, "admin")
            self.assertIsNone(read_session(value + "x", now=120))
            self.assertIsNone(read_session(value, now=161))

    def test_revoked_session_is_rejected_even_with_valid_signature(self):
        with patch("app.services.admin_auth.ADMIN_USERNAME", "admin"), \
             patch("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"), \
             patch("app.services.admin_auth.ADMIN_SESSION_SECRET", "secret"), \
             patch("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 60):
            value = issue_session("admin", issued_at=100)
            self.assertIsNotNone(read_session(value, now=110))
            revoke_session(value)
            self.assertIsNone(read_session(value, now=110))

    def test_revoke_ignores_forged_token(self):
        with patch("app.services.admin_auth.ADMIN_USERNAME", "admin"), \
             patch("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"), \
             patch("app.services.admin_auth.ADMIN_SESSION_SECRET", "secret"), \
             patch("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 60):
            value = issue_session("admin", issued_at=100)
            revoke_session(value[:-2] + "AA")
            self.assertIsNotNone(read_session(value, now=110))

    def test_authenticate_handles_non_ascii_username_without_error(self):
        from app.services.admin_auth import authenticate

        self.accounts.create("관리자", hash_password("pw"), "admin")
        with patch("app.services.admin_auth.ADMIN_SESSION_SECRET", "secret"):
            self.assertTrue(authenticate("관리자", "pw"))
            self.assertFalse(authenticate("관리자2", "pw"))
            self.assertFalse(authenticate("admin", "pw"))
            self.assertFalse(authenticate("관리자", "wrong"))

    def test_disabled_account_cannot_authenticate_or_keep_session(self):
        from app.services.admin_auth import authenticate

        self.accounts.create("kim", hash_password("password-1"), "user")
        with patch("app.services.admin_auth.ADMIN_SESSION_SECRET", "secret"), \
             patch("app.services.admin_auth.ADMIN_USERNAME", "root"), \
             patch("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"), \
             patch("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 600):
            self.assertTrue(authenticate("kim", "password-1"))
            value = issue_session("kim")
            self.assertEqual(read_session(value).role, "user")
            self.accounts.set_active("kim", False)
            self.assertFalse(authenticate("kim", "password-1"))
            self.assertIsNone(read_session(value))


if __name__ == "__main__":
    unittest.main()
