"""관리자 로그인 세션을 서버에 기록합니다. 로그아웃하면 해당 세션을 바로 지웁니다.

각 세션은 발급 당시의 비밀번호 지문(pwd_fp)을 함께 저장합니다. 비밀번호가 바뀌면
지문이 달라져서 옛 세션은 검사에서 거부됩니다. 로그인 검증과 세션 발급 사이에
비밀번호가 바뀌는 경쟁도 이 방식으로 막힙니다.
"""

import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from ..db import DATA_DIR
from .account_store import normalize_username


SESSIONS_PATH = DATA_DIR / "admin_sessions.db"


class AdminSessionStore:
    def __init__(self, db_path: Path = SESSIONS_PATH) -> None:
        self.db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    sid TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    issued_at INTEGER NOT NULL
                )
            """)
            columns = {row[1] for row in db.execute("PRAGMA table_info(admin_sessions)")}
            if "pwd_fp" not in columns:
                # 이전 버전에서 만든 DB에는 열이 없으므로 추가합니다. 빈 값 세션은 다음 검사에서 거부됩니다.
                db.execute("ALTER TABLE admin_sessions ADD COLUMN pwd_fp TEXT NOT NULL DEFAULT ''")
            if "last_seen" not in columns:
                db.execute("ALTER TABLE admin_sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0")
            if "remember" not in columns:
                db.execute("ALTER TABLE admin_sessions ADD COLUMN remember INTEGER NOT NULL DEFAULT 0")
            # 대문자로 저장된 예전 세션도 계정별 로그아웃 대상이 되게 맞춥니다.
            db.execute("UPDATE admin_sessions SET username = lower(username) WHERE username <> lower(username)")

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.db_path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, sid: str, username: str, issued_at: int, ttl_seconds: int,
               pwd_fp: str = "", remember: bool = False, remember_ttl_seconds: int = 0) -> None:
        # 만료된 세션 기록은 새 세션을 만들 때 함께 지웁니다.
        with self._connect() as db:
            db.execute(
                "DELETE FROM admin_sessions WHERE (remember = 0 AND issued_at < ?) OR (remember = 1 AND issued_at < ?)",
                (int(time.time()) - ttl_seconds, int(time.time()) - max(ttl_seconds, remember_ttl_seconds)),
            )
            db.execute(
                "INSERT INTO admin_sessions (sid, username, issued_at, pwd_fp, last_seen, remember) VALUES (?, ?, ?, ?, ?, ?)",
                (sid, normalize_username(username), issued_at, pwd_fp, issued_at, int(remember)),
            )

    def touch(self, sid: str, now: int) -> None:
        with self._connect() as db:
            db.execute("UPDATE admin_sessions SET last_seen = ? WHERE sid = ?", (now, sid))

    def get(self, sid: str) -> tuple[str, str, int, bool] | None:
        """(아이디, 비밀번호 지문, 마지막 사용 시각, 로그인 유지 여부)를 돌려줍니다. 없는 세션이면 None입니다."""
        with self._connect() as db:
            row = db.execute(
                "SELECT username, pwd_fp, last_seen, remember FROM admin_sessions WHERE sid = ?", (sid,)
            ).fetchone()
        return (row[0], row[1], row[2], bool(row[3])) if row else None

    def set_fingerprint(self, sid: str, pwd_fp: str) -> None:
        with self._connect() as db:
            db.execute("UPDATE admin_sessions SET pwd_fp = ? WHERE sid = ?", (pwd_fp, sid))

    def is_active(self, sid: str) -> bool:
        return self.get(sid) is not None

    def revoke(self, sid: str) -> None:
        with self._connect() as db:
            db.execute("DELETE FROM admin_sessions WHERE sid = ?", (sid,))

    def revoke_user(self, username: str) -> None:
        with self._connect() as db:
            db.execute("DELETE FROM admin_sessions WHERE username = ?", (normalize_username(username),))

    def revoke_user_except(self, username: str, keep_sid: str) -> None:
        with self._connect() as db:
            db.execute(
                "DELETE FROM admin_sessions WHERE username = ? AND sid <> ?",
                (normalize_username(username), keep_sid),
            )
