"""누가 언제 어떤 계정·관리 작업을 했는지 기록합니다.

비밀번호, 해시, 재설정 코드는 절대 넘기지 않습니다. 화면과 API에는 조회만 있고 수정·삭제는 없습니다.
"""

import logging
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from ..db import DATA_DIR


logger = logging.getLogger(__name__)
AUDIT_PATH = DATA_DIR / "admin_audit.db"
# ponytail: 1년 지나면 지웁니다. 법적 보관 기간이 정해지면 이 값을 맞출 것.
RETENTION_SECONDS = 365 * 24 * 60 * 60


@dataclass(frozen=True)
class AuditEntry:
    at: int
    actor: str
    action: str
    target: str | None
    ip: str | None


class AuditStore:
    def __init__(self, db_path: Path = AUDIT_PATH) -> None:
        self.db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    at INTEGER NOT NULL,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target TEXT,
                    ip TEXT
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

    def add(self, actor: str, action: str, target: str | None, ip: str | None) -> None:
        now = int(time.time())
        with self._connect() as db:
            db.execute("DELETE FROM audit_log WHERE at < ?", (now - RETENTION_SECONDS,))
            db.execute(
                "INSERT INTO audit_log (at, actor, action, target, ip) VALUES (?, ?, ?, ?, ?)",
                (now, actor[:100], action, target[:100] if target else None, ip),
            )

    def recent(self, limit: int) -> list[AuditEntry]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT at, actor, action, target, ip FROM audit_log ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [AuditEntry(*row) for row in rows]


AUDIT_STORE = AuditStore()


def record(actor: str, action: str, target: str | None = None, ip: str | None = None) -> None:
    """기록에 실패해도 이미 끝난 작업을 500 오류로 바꾸지 않고, 서버 로그에 남깁니다."""
    try:
        AUDIT_STORE.add(actor, action, target, ip)
    except sqlite3.Error:
        logger.exception("Audit log write failed: %s %s", action, target)
