"""관리자 로그인 시도를 공통으로 기록하고 횟수를 제한합니다."""

import math
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from ..db import DATA_DIR


LOGIN_ATTEMPTS_PATH = DATA_DIR / "admin_login_attempts.db"


class LoginRateLimiter:
    def __init__(
        self,
        db_path: Path = LOGIN_ATTEMPTS_PATH,
        max_attempts: int = 5,
        window_seconds: int = 300,
        block_seconds: int = 900,
    ) -> None:
        self.db_path = db_path
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS admin_login_attempts (
                    client_key TEXT PRIMARY KEY,
                    window_started REAL NOT NULL,
                    attempts INTEGER NOT NULL,
                    blocked_until REAL NOT NULL DEFAULT 0
                )
            """)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.db_path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def reserve(self, client_key: str, now: float | None = None,
                max_attempts: int | None = None) -> int:
        """비밀번호 검사 한 건을 예약하고, 차단 중이면 대기 시간을 초로 반환합니다."""
        current = time.time() if now is None else now
        limit = self.max_attempts if max_attempts is None else max_attempts
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "DELETE FROM admin_login_attempts "
                "WHERE window_started < ? AND blocked_until <= ?",
                (current - self.window_seconds - self.block_seconds, current),
            )
            row = db.execute(
                "SELECT window_started, attempts, blocked_until "
                "FROM admin_login_attempts WHERE client_key = ?",
                (client_key,),
            ).fetchone()
            if row and row[2] > current:
                return math.ceil(row[2] - current)
            if row and current - row[0] < self.window_seconds:
                if row[1] >= limit:
                    db.execute(
                        "UPDATE admin_login_attempts SET blocked_until = ? WHERE client_key = ?",
                        (current + self.block_seconds, client_key),
                    )
                    return self.block_seconds
                db.execute(
                    "UPDATE admin_login_attempts SET attempts = attempts + 1 WHERE client_key = ?",
                    (client_key,),
                )
            else:
                db.execute(
                    "INSERT INTO admin_login_attempts "
                    "(client_key, window_started, attempts, blocked_until) VALUES (?, ?, 1, 0) "
                    "ON CONFLICT(client_key) DO UPDATE SET "
                    "window_started = excluded.window_started, attempts = 1, blocked_until = 0",
                    (client_key, current),
                )
        return 0

    def clear(self, client_key: str) -> None:
        with self._connect() as db:
            db.execute("DELETE FROM admin_login_attempts WHERE client_key = ?", (client_key,))
