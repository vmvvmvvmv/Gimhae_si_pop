"""회원가입 신청과 비밀번호 재설정 요청을 저장합니다.

두 종류 모두 관리자가 승인하기 전에는 계정에 아무 영향도 주지 않습니다.
아이디는 계정 저장소와 같은 규칙(소문자)으로 저장합니다.
"""

import hashlib
import hmac
import secrets
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from .account_store import ACCOUNTS_PATH, normalize_username


SIGNUP = "signup"
RESET = "reset"
RESET_CODE_TTL_SECONDS = 30 * 60
# 관리자가 처리하지 않은 신청·요청은 7일 뒤 자동으로 지웁니다.
REQUEST_TTL_SECONDS = 7 * 24 * 60 * 60
# 헷갈리는 글자(0, O, 1, I 등)를 뺀 알파벳으로 10자리 코드를 만듭니다.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


@dataclass(frozen=True)
class AccountRequest:
    kind: str
    username: str
    created_at: int
    code_issued: bool


def _code_digest(code: str) -> str:
    normalized = code.replace("-", "").strip().upper()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class AccountRequestStore:
    def __init__(self, db_path: Path = ACCOUNTS_PATH) -> None:
        self.db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS account_requests (
                    kind TEXT NOT NULL,
                    username TEXT NOT NULL,
                    password_hash TEXT,
                    code_hash TEXT,
                    expires_at INTEGER,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (kind, username)
                )
            """)
            try:
                db.execute(
                    "UPDATE account_requests SET username = lower(username) "
                    "WHERE username <> lower(username)"
                )
            except sqlite3.IntegrityError as error:
                raise RuntimeError(
                    "대소문자만 다른 중복 요청이 있어서 시작할 수 없습니다. 정리한 뒤 다시 실행하세요."
                ) from error

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def _prune(self, db: sqlite3.Connection, now: int | None = None) -> None:
        current = int(time.time()) if now is None else now
        db.execute(
            "DELETE FROM account_requests WHERE created_at < ?",
            (current - REQUEST_TTL_SECONDS,),
        )

    def add_signup(self, username: str, password_hash: str) -> None:
        """같은 아이디(대소문자 무시)로 대기 중인 신청이 있으면 sqlite3.IntegrityError를 냅니다."""
        with self._connect() as db:
            self._prune(db)
            db.execute(
                "INSERT INTO account_requests (kind, username, password_hash, created_at) "
                "VALUES (?, ?, ?, ?)",
                (SIGNUP, normalize_username(username), password_hash, int(time.time())),
            )

    def add_reset(self, username: str) -> None:
        # 이미 대기 중이면 그대로 둡니다. 같은 요청을 여러 번 보내도 한 건입니다.
        with self._connect() as db:
            self._prune(db)
            db.execute(
                "INSERT OR IGNORE INTO account_requests (kind, username, created_at) "
                "VALUES (?, ?, ?)",
                (RESET, normalize_username(username), int(time.time())),
            )

    def list(self, kind: str) -> list[AccountRequest]:
        with self._connect() as db:
            self._prune(db)
            rows = db.execute(
                "SELECT kind, username, created_at, code_hash FROM account_requests "
                "WHERE kind = ? ORDER BY created_at, username",
                (kind,),
            ).fetchall()
        return [
            AccountRequest(
                kind=row["kind"],
                username=row["username"],
                created_at=row["created_at"],
                code_issued=row["code_hash"] is not None,
            )
            for row in rows
        ]

    def take_signup(self, username: str) -> str | None:
        """신청을 한 번만 꺼냅니다. 두 번 승인해도 두 번째는 None을 받습니다."""
        username = normalize_username(username)
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT password_hash FROM account_requests WHERE kind = ? AND username = ?",
                (SIGNUP, username),
            ).fetchone()
            if row is None:
                return None
            db.execute(
                "DELETE FROM account_requests WHERE kind = ? AND username = ?",
                (SIGNUP, username),
            )
            return row["password_hash"]

    def reject(self, kind: str, username: str) -> bool:
        with self._connect() as db:
            cursor = db.execute(
                "DELETE FROM account_requests WHERE kind = ? AND username = ?",
                (kind, normalize_username(username)),
            )
            return cursor.rowcount > 0

    def exists(self, kind: str, username: str) -> bool:
        with self._connect() as db:
            return db.execute(
                "SELECT 1 FROM account_requests WHERE kind = ? AND username = ?",
                (kind, normalize_username(username)),
            ).fetchone() is not None

    def issue_reset_code(self, username: str) -> str | None:
        """승인된 재설정 요청에 일회용 코드를 붙입니다. 코드 원문은 이 반환값으로만 한 번 보입니다."""
        code = "-".join(
            "".join(secrets.choice(_CODE_ALPHABET) for _ in range(5)) for _ in range(2)
        )
        with self._connect() as db:
            cursor = db.execute(
                "UPDATE account_requests SET code_hash = ?, expires_at = ? "
                "WHERE kind = ? AND username = ?",
                (
                    _code_digest(code),
                    int(time.time()) + RESET_CODE_TTL_SECONDS,
                    RESET,
                    normalize_username(username),
                ),
            )
            return code if cursor.rowcount == 1 else None

    def consume_reset_code(self, username: str, code: str) -> bool:
        """코드가 맞고 만료 전이면 한 번만 참이 됩니다.

        UPDATE 한 문장이 검사와 소비를 함께 하므로, 같은 코드를 동시에 보내도 한쪽만 성공합니다.
        """
        with self._connect() as db:
            cursor = db.execute(
                "UPDATE account_requests SET code_hash = NULL, expires_at = NULL "
                "WHERE kind = ? AND username = ? AND code_hash = ? AND expires_at > ?",
                (RESET, normalize_username(username), _code_digest(code), int(time.time())),
            )
            return cursor.rowcount == 1
