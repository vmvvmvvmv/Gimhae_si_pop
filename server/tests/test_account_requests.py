import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.services.audit_log import AuditStore
from app.services.account_store import AccountStore
from app.services.account_requests import AccountRequestStore
from app.services.admin_auth import SESSION_COOKIE_NAME, hash_password, issue_session
from app.services.admin_login_limit import LoginRateLimiter
from app.services.admin_session_store import AdminSessionStore


PASSWORD = "long-enough-password"


class RequestFlowTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.accounts = AccountStore(root / "accounts.db")
        self.requests = AccountRequestStore(root / "accounts.db")
        self.sessions = AdminSessionStore(root / "sessions.db")
        self.accounts.create("root", hash_password(PASSWORD), "admin")
        self.accounts.create("kim", hash_password(PASSWORD), "user")

        engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                               poolclass=StaticPool)
        Base.metadata.create_all(engine)
        db_sessions = sessionmaker(bind=engine)

        def test_db():
            with db_sessions() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.addCleanup(app.dependency_overrides.clear)
        targets = [
            ("app.services.audit_log.AUDIT_STORE", AuditStore(root / "audit.db")),
            ("app.services.admin_auth.ACCOUNT_STORE", self.accounts),
            ("app.api.admin.ACCOUNT_STORE", self.accounts),
            ("app.api.auth.ACCOUNT_STORE", self.accounts),
            ("app.services.admin_auth.ACCOUNT_REQUESTS", self.requests),
            ("app.api.admin.ACCOUNT_REQUESTS", self.requests),
            ("app.api.auth.ACCOUNT_REQUESTS", self.requests),
            ("app.services.admin_auth.SESSION_STORE", self.sessions),
            ("app.api.admin.SESSION_STORE", self.sessions),
            ("app.api.auth.SESSION_STORE", self.sessions),
            ("app.services.admin_auth.ADMIN_SESSION_SECRET", "test-secret"),
            ("app.services.admin_auth.ADMIN_USERNAME", "root"),
            ("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"),
            ("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 600),
            ("app.api.admin.login_limiter",
             LoginRateLimiter(root / "admin_attempts.db", max_attempts=1000)),
            # 공개 가입·재설정 요청은 테스트 중 많이 호출하므로 횟수 제한을 크게 둡니다.
            ("app.api.auth.auth_limiter",
             LoginRateLimiter(root / "auth_attempts.db", max_attempts=1000)),
        ]
        for target, value in targets:
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def login_as(self, username: str) -> None:
        self.client.cookies.set(SESSION_COOKIE_NAME, issue_session(username))

    def logged_out(self) -> None:
        self.client.cookies.clear()

    # 회원가입

    def test_signup_is_pending_until_admin_approves(self):
        self.logged_out()
        response = self.client.post("/api/auth/signup", json={
            "username": "park_01", "password": PASSWORD})
        self.assertEqual(response.status_code, 202)
        self.assertIsNone(self.accounts.get("park_01"))
        self.assertEqual(self.client.post("/api/admin/login", json={
            "username": "park_01", "password": PASSWORD}).status_code, 401)

        self.login_as("root")
        listed = self.client.get("/api/admin/requests", params={"kind": "signup"}).json()
        self.assertEqual([item["username"] for item in listed["items"]], ["park_01"])
        self.assertEqual(self.client.post("/api/admin/requests/signup/park_01/approve").status_code, 201)

        self.logged_out()
        self.assertEqual(self.client.post("/api/admin/login", json={
            "username": "park_01", "password": PASSWORD}).status_code, 200)
        self.assertEqual(self.accounts.get("park_01").role, "user")

    def test_signup_rejects_existing_and_duplicate_pending_names(self):
        self.logged_out()
        self.assertEqual(self.client.post("/api/auth/signup", json={
            "username": "kim", "password": PASSWORD}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/signup", json={
            "username": "lee_02", "password": PASSWORD}).status_code, 202)
        self.assertEqual(self.client.post("/api/auth/signup", json={
            "username": "lee_02", "password": PASSWORD}).status_code, 409)

    def test_approving_twice_or_after_reject_is_not_found(self):
        self.logged_out()
        self.client.post("/api/auth/signup", json={"username": "lee_02", "password": PASSWORD})
        self.login_as("root")
        self.assertEqual(self.client.post("/api/admin/requests/signup/lee_02/approve").status_code, 201)
        self.assertEqual(self.client.post("/api/admin/requests/signup/lee_02/approve").status_code, 404)

        self.client.post("/api/auth/signup", json={"username": "choi_03", "password": PASSWORD})
        self.assertEqual(self.client.post("/api/admin/requests/signup/choi_03/reject").status_code, 200)
        self.assertEqual(self.client.post("/api/admin/requests/signup/choi_03/approve").status_code, 404)
        self.assertIsNone(self.accounts.get("choi_03"))

    def test_regular_user_cannot_approve_signups(self):
        self.logged_out()
        self.client.post("/api/auth/signup", json={"username": "lee_02", "password": PASSWORD})
        self.login_as("kim")
        self.assertEqual(self.client.post("/api/admin/requests/signup/lee_02/approve").status_code, 403)

    # 비밀번호 재설정

    def test_reset_request_checks_account_exists_first(self):
        self.logged_out()
        unknown = self.client.post("/api/auth/password-reset/request", json={"username": "nobody"})
        self.assertEqual(unknown.status_code, 404)
        self.assertFalse(self.requests.exists("reset", "nobody"))
        known = self.client.post("/api/auth/password-reset/request", json={"username": "kim"})
        self.assertEqual(known.status_code, 202)
        self.assertTrue(self.requests.exists("reset", "kim"))

    def test_reset_request_finds_account_regardless_of_case(self):
        self.logged_out()
        response = self.client.post("/api/auth/password-reset/request", json={"username": "KIM"})
        self.assertEqual(response.status_code, 202)
        self.assertTrue(self.requests.exists("reset", "kim"))

    def test_signup_rejects_same_name_in_any_case(self):
        self.logged_out()
        self.assertEqual(self.client.post("/api/auth/signup", json={
            "username": "Kim", "password": PASSWORD}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/signup", json={
            "username": "park_77", "password": PASSWORD}).status_code, 202)
        self.assertEqual(self.client.post("/api/auth/signup", json={
            "username": "PARK_77", "password": PASSWORD}).status_code, 409)

    def test_login_is_case_insensitive_and_names_are_stored_lowercase(self):
        self.logged_out()
        self.client.post("/api/auth/signup", json={"username": "Lee_88", "password": PASSWORD})
        self.login_as("root")
        self.assertEqual(self.client.post("/api/admin/requests/signup/LEE_88/approve").status_code, 201)
        self.logged_out()
        self.assertEqual(self.client.post("/api/admin/login", json={
            "username": "LEE_88", "password": PASSWORD}).status_code, 200)
        self.assertIsNotNone(self.accounts.get("lee_88"))
        raw = sqlite3.connect(self.accounts.db_path)
        try:
            names = [row[0] for row in raw.execute("SELECT username FROM accounts")]
        finally:
            raw.close()
        self.assertNotIn("Lee_88", names)

    def test_reset_flow_with_admin_issued_code(self):
        self.logged_out()
        self.client.post("/api/auth/password-reset/request", json={"username": "kim"})
        self.login_as("root")
        approved = self.client.post("/api/admin/requests/reset/kim/approve").json()
        code = approved["code"]
        self.assertEqual(approved["expiresInMinutes"], 30)

        self.logged_out()
        self.assertEqual(self.client.post("/api/auth/password-reset/confirm", json={
            "username": "kim", "code": "WRONG-CODE1", "new_password": "brand-new-password",
        }).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/password-reset/confirm", json={
            "username": "kim", "code": code, "new_password": "brand-new-password",
        }).status_code, 200)
        # 같은 코드는 한 번만 쓸 수 있습니다.
        self.assertEqual(self.client.post("/api/auth/password-reset/confirm", json={
            "username": "kim", "code": code, "new_password": "another-password",
        }).status_code, 400)
        self.assertEqual(self.client.post("/api/admin/login", json={
            "username": "kim", "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.client.post("/api/admin/login", json={
            "username": "kim", "password": "brand-new-password"}).status_code, 200)

    def test_reset_confirm_without_approval_fails(self):
        self.logged_out()
        self.client.post("/api/auth/password-reset/request", json={"username": "kim"})
        self.assertEqual(self.client.post("/api/auth/password-reset/confirm", json={
            "username": "kim", "code": "ABCDE-FGHJK", "new_password": "brand-new-password",
        }).status_code, 400)

    def test_reset_revokes_existing_sessions(self):
        self.logged_out()
        self.client.post("/api/auth/password-reset/request", json={"username": "kim"})
        self.login_as("root")
        code = self.client.post("/api/admin/requests/reset/kim/approve").json()["code"]
        kim_session = issue_session("kim")
        self.logged_out()
        self.client.post("/api/auth/password-reset/confirm", json={
            "username": "kim", "code": code, "new_password": "brand-new-password"})
        self.client.cookies.set(SESSION_COOKIE_NAME, kim_session)
        self.assertEqual(self.client.get("/api/admin/session").status_code, 401)

    def test_concurrent_confirm_with_same_code_succeeds_once(self):
        self.requests.add_reset("kim")
        code = self.requests.issue_reset_code("kim")
        barrier = threading.Barrier(4)
        results: list[bool] = []
        lock = threading.Lock()

        def confirm() -> None:
            store = AccountRequestStore(self.requests.db_path)
            barrier.wait()
            outcome = store.consume_reset_code("kim", code)
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=confirm) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertEqual(results.count(True), 1)

    # 로그인한 사용자의 비밀번호 변경

    def test_self_password_change_keeps_this_session_only(self):
        self.login_as("kim")
        current = self.client.cookies.get(SESSION_COOKIE_NAME)
        other = issue_session("kim")
        self.assertEqual(self.client.post("/api/auth/password", json={
            "current_password": "wrong-password-x", "new_password": "brand-new-password",
        }).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/password", json={
            "current_password": PASSWORD, "new_password": "brand-new-password",
        }).status_code, 200)
        self.assertEqual(self.client.get("/api/admin/session").status_code, 200)
        self.client.cookies.set(SESSION_COOKIE_NAME, other)
        self.assertEqual(self.client.get("/api/admin/session").status_code, 401)
        self.assertIsNotNone(current)

    def test_self_password_change_requires_login(self):
        self.logged_out()
        self.assertEqual(self.client.post("/api/auth/password", json={
            "current_password": PASSWORD, "new_password": "brand-new-password",
        }).status_code, 401)


if __name__ == "__main__":
    unittest.main()
