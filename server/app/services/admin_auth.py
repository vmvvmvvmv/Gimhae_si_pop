import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from ..core.config import (
    ADMIN_PASSWORD_HASH,
    ADMIN_SESSION_SECRET,
    ADMIN_SESSION_TTL_SECONDS,
    ADMIN_USERNAME,
)
from .account_requests import AccountRequestStore
from .account_store import AccountStore
from .admin_session_store import AdminSessionStore

SESSION_COOKIE_NAME = "gimhae_admin_session"
PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 600_000

SESSION_STORE = AdminSessionStore()
ACCOUNT_STORE = AccountStore()
ACCOUNT_REQUESTS = AccountRequestStore()


@dataclass(frozen=True)
class AdminSession:
    username: str
    role: str
    issued_at: int


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return "$".join((
        PASSWORD_ALGORITHM,
        str(PASSWORD_ITERATIONS),
        _encode(salt),
        _encode(digest),
    ))


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = encoded.split("$")
        if algorithm != PASSWORD_ALGORITHM:
            return False
        iterations = int(iterations_text)
        salt = _decode(salt_text)
        expected = _decode(digest_text)
    except (ValueError, TypeError):
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual, expected)


def admin_auth_configured() -> bool:
    return bool(ADMIN_USERNAME and ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET)


# 환경 변수의 관리자는 최초 1회 계정으로 만듭니다. 이후 비밀번호는 관리자 화면에서 바꿉니다.
if admin_auth_configured():
    ACCOUNT_STORE.ensure_admin(ADMIN_USERNAME, ADMIN_PASSWORD_HASH)


def password_fingerprint(password_hash: str) -> str:
    """세션에 남기는 비밀번호 지문입니다. 해시 자체를 세션에 저장하지 않으려고 씁니다."""
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:32]


def authenticate_account(username: str, password: str):
    """아이디·비밀번호가 맞고 활성 계정이면 그 계정을, 아니면 None을 돌려줍니다."""
    account = ACCOUNT_STORE.get(username)
    if account is None or not account.is_active:
        return None
    if not verify_password(password, account.password_hash):
        return None
    return account


def authenticate(username: str, password: str) -> bool:
    return authenticate_account(username, password) is not None


def require_user(request: Request) -> AdminSession:
    session = read_session(request.cookies.get(SESSION_COOKIE_NAME))
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 필요합니다.",
        )
    return session


def require_admin(request: Request) -> AdminSession:
    session = require_user(request)
    if session.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다.",
        )
    return session


def issue_session(username: str, issued_at: int | None = None,
                  pwd_fp: str | None = None) -> str:
    timestamp = issued_at or int(time.time())
    if pwd_fp is None:
        account = ACCOUNT_STORE.get(username)
        if account is None:
            raise ValueError("계정이 없어 세션을 만들 수 없습니다.")
        pwd_fp = password_fingerprint(account.password_hash)
    sid = secrets.token_urlsafe(16)
    SESSION_STORE.create(sid, username, timestamp, ADMIN_SESSION_TTL_SECONDS, pwd_fp)
    payload = f"{username}|{timestamp}|{sid}".encode("utf-8")
    signature = hmac.new(
        ADMIN_SESSION_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).digest()
    return f"{_encode(payload)}.{_encode(signature)}"


def _verified_payload(value: str | None) -> tuple[str, int, str] | None:
    """서명이 맞는 토큰이면 (아이디, 발급 시각, 세션 ID)를 돌려줍니다."""
    if not value or not admin_auth_configured():
        return None
    try:
        payload_text, signature_text = value.split(".")
        payload = _decode(payload_text)
        signature = _decode(signature_text)
        username, issued_text, sid = payload.decode("utf-8").rsplit("|", 2)
        issued_at = int(issued_text)
    except (ValueError, TypeError, UnicodeDecodeError):
        return None

    expected = hmac.new(
        ADMIN_SESSION_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(signature, expected):
        return None
    return username, issued_at, sid


def read_session(value: str | None, now: int | None = None) -> AdminSession | None:
    verified = _verified_payload(value)
    if verified is None:
        return None
    username, issued_at, sid = verified
    current_time = now or int(time.time())
    if issued_at > current_time:
        return None
    if current_time - issued_at >= ADMIN_SESSION_TTL_SECONDS:
        return None
    # 로그아웃·비활성화로 지워진 세션은 거부합니다.
    stored = SESSION_STORE.get(sid)
    if stored is None or stored[0] != username:
        return None
    # 역할과 활성 여부는 요청마다 계정 기록에서 다시 읽어서, 변경이 바로 반영되게 합니다.
    account = ACCOUNT_STORE.get(username)
    if account is None or not account.is_active:
        return None
    # 비밀번호가 바뀌었으면 발급 당시의 지문과 달라져서 옛 세션은 거부됩니다.
    if not hmac.compare_digest(stored[1], password_fingerprint(account.password_hash)):
        return None
    return AdminSession(username=username, role=account.role, issued_at=issued_at)


def session_id(value: str | None) -> str | None:
    verified = _verified_payload(value)
    return verified[2] if verified is not None else None


def revoke_session(value: str | None) -> None:
    verified = _verified_payload(value)
    if verified is not None:
        SESSION_STORE.revoke(verified[2])


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


if __name__ == "__main__":
    import getpass

    print(hash_password(getpass.getpass("Password: ")))
