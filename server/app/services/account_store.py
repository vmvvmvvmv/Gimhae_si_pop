"""관리자 페이지에서 관리하는 로그인 계정을 SQLite에 저장합니다.

아이디는 항상 소문자로 저장하고 비교합니다. 그래야 `Kim`과 `kim`이 서로 다른 계정으로 중복 생성되지 않습니다.
"""

import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from ..db import DATA_DIR


ACCOUNTS_PATH = DATA_DIR / "admin_accounts.db"
ROLES = ("admin", "user")


def normalize_username(username: str) -> str:
    return username.strip().lower()


@dataclass(frozen=True)
class Account:
    username: str
    password_hash: str
    role: str
    is_active: bool
    created_at: int


class LastAdminError(RuntimeError):
    pass


class AccountStore:
    def __init__(self, db_path: Path = ACCOUNTS_PATH) -> None:
        self.db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS accounts (
                    username TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL
                )
            """)
            self._lowercase_existing(db)

    def _lowercase_existing(self, db: sqlite3.Connection) -> None:
        """이전에 대문자로 저장된 아이디를 소문자로 바꿉니다. 충돌하면 자동으로 덮지 않고 멈춥니다."""
        try:
            db.execute("UPDATE accounts SET username = lower(username) WHERE username <> lower(username)")
        except sqlite3.IntegrityError as error:
            raise RuntimeError(
                "대소문자만 다른 중복 아이디가 있어서 시작할 수 없습니다. "
                "admin_accounts.db에서 중복 계정을 정리한 뒤 다시 실행하세요."
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

    def get(self, username: str) -> Account | None:
        with self._connect() as db:
            row = db.execute(
                "SELECT * FROM accounts WHERE username = ?", (normalize_username(username),)
            ).fetchone()
        return _account(row) if row else None

    def list(self) -> list[Account]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM accounts ORDER BY created_at, username").fetchall()
        return [_account(row) for row in rows]

    def create(self, username: str, password_hash: str, role: str) -> None:
        """이미 있는 아이디(대소문자 무시)이면 sqlite3.IntegrityError를 냅니다."""
        if role not in ROLES:
            raise ValueError("역할은 admin 또는 user여야 합니다.")
        with self._connect() as db:
            db.execute(
                "INSERT INTO accounts (username, password_hash, role, is_active, created_at) "
                "VALUES (?, ?, ?, 1, ?)",
                (normalize_username(username), password_hash, role, int(time.time())),
            )

    def ensure_admin(self, username: str, password_hash: str) -> None:
        """환경 변수의 관리자는 계정이 없을 때만 만듭니다. 이후 비밀번호는 화면에서 바꿉니다."""
        with self._connect() as db:
            db.execute(
                "INSERT OR IGNORE INTO accounts (username, password_hash, role, is_active, created_at) "
                "VALUES (?, ?, 'admin', 1, ?)",
                (normalize_username(username), password_hash, int(time.time())),
            )

    def force_admin(self, username: str, password_hash: str) -> None:
        """복구용: 계정을 활성 관리자로 만들거나, 있으면 역할·활성·비밀번호를 되돌립니다."""
        with self._connect() as db:
            db.execute(
                "INSERT INTO accounts (username, password_hash, role, is_active, created_at) "
                "VALUES (?, ?, 'admin', 1, ?) "
                "ON CONFLICT(username) DO UPDATE SET "
                "password_hash = excluded.password_hash, role = 'admin', is_active = 1",
                (normalize_username(username), password_hash, int(time.time())),
            )

    def update(self, username: str, *, is_active: bool | None = None,
               password_hash: str | None = None) -> None:
        username = normalize_username(username)
        with self._connect() as db:
            if is_active is not None:
                db.execute(
                    "UPDATE accounts SET is_active = ? WHERE username = ?",
                    (int(is_active), username),
                )
            if password_hash is not None:
                db.execute(
                    "UPDATE accounts SET password_hash = ? WHERE username = ?",
                    (password_hash, username),
                )

    def rename(self, username: str, new_username: str) -> None:
        """이미 있는 아이디(대소문자 무시)로 바꾸면 sqlite3.IntegrityError를 냅니다."""
        with self._connect() as db:
            db.execute(
                "UPDATE accounts SET username = ? WHERE username = ?",
                (normalize_username(new_username), normalize_username(username)),
            )

    def set_active(self, username: str, active: bool) -> None:
        """마지막 활성 관리자는 비활성화할 수 없습니다.

        확인과 변경을 BEGIN IMMEDIATE 한 트랜잭션에서 해서, 두 관리자가 동시에
        서로를 비활성화해 관리자가 0명이 되는 경쟁을 막습니다.
        """
        username = normalize_username(username)
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT role, is_active FROM accounts WHERE username = ?", (username,)
            ).fetchone()
            if row is None:
                raise KeyError(username)
            if not active and row["role"] == "admin" and row["is_active"]:
                others = db.execute(
                    "SELECT COUNT(*) FROM accounts "
                    "WHERE role = 'admin' AND is_active = 1 AND username <> ?",
                    (username,),
                ).fetchone()[0]
                if others == 0:
                    raise LastAdminError("마지막 관리자 계정은 비활성화할 수 없습니다.")
            db.execute(
                "UPDATE accounts SET is_active = ? WHERE username = ?",
                (int(active), username),
            )

    def delete(self, username: str) -> None:
        """계정을 완전히 지웁니다. 마지막 활성 관리자는 지울 수 없습니다(확인과 삭제를 한 트랜잭션에서 합니다)."""
        username = normalize_username(username)
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT role, is_active FROM accounts WHERE username = ?", (username,)
            ).fetchone()
            if row is None:
                raise KeyError(username)
            if row["role"] == "admin" and row["is_active"]:
                others = db.execute(
                    "SELECT COUNT(*) FROM accounts "
                    "WHERE role = 'admin' AND is_active = 1 AND username <> ?",
                    (username,),
                ).fetchone()[0]
                if others == 0:
                    raise LastAdminError("마지막 관리자 계정은 삭제할 수 없습니다.")
            db.execute("DELETE FROM accounts WHERE username = ?", (username,))


def _account(row: sqlite3.Row) -> Account:
    return Account(
        username=row["username"],
        password_hash=row["password_hash"],
        role=row["role"],
        is_active=bool(row["is_active"]),
        created_at=row["created_at"],
    )
