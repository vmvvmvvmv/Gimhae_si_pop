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
from app.services.account_store import AccountStore, LastAdminError
from app.services.admin_auth import (
    SESSION_COOKIE_NAME,
    hash_password,
    issue_session,
)
from app.services.admin_login_limit import LoginRateLimiter
from app.services.admin_session_store import AdminSessionStore


PASSWORD = "long-enough-password"


class AccountStoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / "accounts.db"
        self.store = AccountStore(self.path)

    def test_duplicate_username_is_rejected_by_database(self):
        self.store.create("kim", hash_password(PASSWORD), "user")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.create("kim", hash_password(PASSWORD), "admin")

    def test_last_active_admin_cannot_be_deactivated(self):
        self.store.create("root", hash_password(PASSWORD), "admin")
        self.store.create("kim", hash_password(PASSWORD), "user")
        with self.assertRaises(LastAdminError):
            self.store.set_active("root", False)
        self.assertTrue(self.store.get("root").is_active)

    def test_admin_can_be_deactivated_when_another_admin_remains(self):
        self.store.create("root", hash_password(PASSWORD), "admin")
        self.store.create("ops", hash_password(PASSWORD), "admin")
        self.store.set_active("root", False)
        self.assertFalse(self.store.get("root").is_active)

    def test_concurrent_deactivation_keeps_one_admin(self):
        # 관리자 두 명이 동시에 서로를 비활성화해도, 하나는 반드시 막혀야 합니다.
        self.store.create("a", hash_password(PASSWORD), "admin")
        self.store.create("b", hash_password(PASSWORD), "admin")
        barrier = threading.Barrier(2)
        results: list[str] = []
        lock = threading.Lock()

        def deactivate(username: str) -> None:
            store = AccountStore(self.path)
            barrier.wait()
            try:
                store.set_active(username, False)
                outcome = "ok"
            except LastAdminError:
                outcome = "blocked"
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=deactivate, args=(name,)) for name in ("a", "b")]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)

        self.assertEqual(sorted(results), ["blocked", "ok"])
        active_admins = [a for a in self.store.list() if a.role == "admin" and a.is_active]
        self.assertEqual(len(active_admins), 1)


class AccountApiTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.accounts = AccountStore(root / "accounts.db")
        self.sessions = AdminSessionStore(root / "sessions.db")
        self.accounts.create("root", hash_password(PASSWORD), "admin")
        self.accounts.create("kim", hash_password(PASSWORD), "user")

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        db_sessions = sessionmaker(bind=engine)

        def test_db():
            with db_sessions() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.addCleanup(app.dependency_overrides.clear)
        # 저장소 객체는 모듈 import 시점에 이름으로 묶이므로, 쓰는 모듈마다 모두 바꿉니다.
        targets = [
            ("app.services.audit_log.AUDIT_STORE", AuditStore(root / "audit.db")),
            ("app.services.admin_auth.ACCOUNT_STORE", self.accounts),
            ("app.api.admin.ACCOUNT_STORE", self.accounts),
            ("app.services.admin_auth.SESSION_STORE", self.sessions),
            ("app.api.admin.SESSION_STORE", self.sessions),
            ("app.services.admin_auth.ADMIN_SESSION_SECRET", "test-secret"),
            ("app.services.admin_auth.ADMIN_USERNAME", "root"),
            ("app.services.admin_auth.ADMIN_PASSWORD_HASH", "configured"),
            ("app.services.admin_auth.ADMIN_SESSION_TTL_SECONDS", 600),
            ("app.api.admin.login_limiter",
             LoginRateLimiter(Path(self._tmp.name) / "attempts.db")),
        ]
        for target, value in targets:
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def login_as(self, username: str) -> None:
        self.client.cookies.set(SESSION_COOKIE_NAME, issue_session(username))

    def test_landing_data_is_public_but_features_require_login(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        self.assertEqual(self.client.get("/api/population/availability").status_code, 200)
        self.assertEqual(self.client.get("/api/facilities").status_code, 200)
        self.assertEqual(self.client.get("/api/population/export.csv",
                                         params={"scope": "month", "stats_ym": "202608",
                                                 "fields": "population"}).status_code, 401)
        self.assertEqual(self.client.get("/api/population/trend",
                                         params={"region_code": "4825025000"}).status_code, 401)

    def test_regular_user_can_use_features_but_not_admin_pages(self):
        self.login_as("kim")
        self.assertEqual(self.client.get("/api/population/trend", params={"region_code": "4825025000"}).status_code, 404)
        self.assertEqual(self.client.get("/api/admin/users").status_code, 403)
        self.assertEqual(self.client.post("/api/admin/users", json={
            "username": "newbie", "password": PASSWORD, "role": "user"}).status_code, 403)

    def test_admin_creates_user_and_user_can_log_in(self):
        self.login_as("root")
        created = self.client.post("/api/admin/users", json={
            "username": "park_01", "password": PASSWORD, "role": "user"})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.client.post("/api/admin/users", json={
            "username": "park_01", "password": PASSWORD}).status_code, 409)

        self.client.cookies.clear()
        login = self.client.post("/api/admin/login", json={
            "username": "park_01", "password": PASSWORD})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(self.client.get("/api/admin/session").json()["role"], "user")

    def test_disable_revokes_existing_session_immediately(self):
        self.login_as("root")
        kim_session = issue_session("kim")
        self.assertEqual(self.client.patch("/api/admin/users/kim", json={"is_active": False}).status_code, 200)
        self.client.cookies.set(SESSION_COOKIE_NAME, kim_session)
        self.assertEqual(self.client.get("/api/population/trend", params={"region_code": "4825025000"}).status_code, 401)

    def test_password_reset_revokes_sessions_and_new_password_works(self):
        self.login_as("root")
        kim_session = issue_session("kim")
        self.assertEqual(self.client.patch("/api/admin/users/kim", json={
            "password": "brand-new-password"}).status_code, 200)
        self.client.cookies.set(SESSION_COOKIE_NAME, kim_session)
        self.assertEqual(self.client.get("/api/population/trend", params={"region_code": "4825025000"}).status_code, 401)

        self.client.cookies.clear()
        self.assertEqual(self.client.post("/api/admin/login", json={
            "username": "kim", "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.client.post("/api/admin/login", json={
            "username": "kim", "password": "brand-new-password"}).status_code, 200)

    def test_admin_cannot_disable_self_or_last_admin(self):
        self.login_as("root")
        self.assertEqual(self.client.patch("/api/admin/users/root", json={
            "is_active": False}).status_code, 409)
        self.assertTrue(self.accounts.get("root").is_active)

    def test_short_password_and_bad_username_are_rejected(self):
        self.login_as("root")
        self.assertEqual(self.client.post("/api/admin/users", json={
            "username": "ok_user", "password": "short"}).status_code, 422)
        self.assertEqual(self.client.post("/api/admin/users", json={
            "username": "관리자", "password": PASSWORD}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
