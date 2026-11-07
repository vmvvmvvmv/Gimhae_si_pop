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

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.db_path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, sid: str, username: str, issued_at: int, ttl_seconds: int,
               pwd_fp: str = "") -> None:
        # 만료된 세션 기록은 새 세션을 만들 때 함께 지웁니다.
        with self._connect() as db:
            db.execute(
                "DELETE FROM admin_sessions WHERE issued_at < ?",
                (int(time.time()) - ttl_seconds,),
            )
            db.execute(
                "INSERT INTO admin_sessions (sid, username, issued_at, pwd_fp) VALUES (?, ?, ?, ?)",
                (sid, username, issued_at, pwd_fp),
            )

    def get(self, sid: str) -> tuple[str, str] | None:
        """(아이디, 비밀번호 지문)을 돌려줍니다. 없는 세션이면 None입니다."""
        with self._connect() as db:
            row = db.execute(
                "SELECT username, pwd_fp FROM admin_sessions WHERE sid = ?", (sid,)
            ).fetchone()
        return (row[0], row[1]) if row else None

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
            db.execute("DELETE FROM admin_sessions WHERE username = ?", (username,))

    def revoke_user_except(self, username: str, keep_sid: str) -> None:
        with self._connect() as db:
            db.execute(
                "DELETE FROM admin_sessions WHERE username = ? AND sid <> ?",
                (username, keep_sid),
            )
