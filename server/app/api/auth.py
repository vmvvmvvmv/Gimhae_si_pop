import hashlib
import hmac
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ..core.config import ADMIN_SESSION_SECRET
from ..db import DATA_DIR
from ..services import audit_log
from ..services.account_store import normalize_username
from ..services.admin_auth import (
    ACCOUNT_REQUESTS,
    ACCOUNT_STORE,
    SESSION_COOKIE_NAME,
    SESSION_STORE,
    AdminSession,
    hash_password,
    password_fingerprint,
    require_user,
    session_id,
    verify_password,
)
from ..services.admin_login_limit import LoginRateLimiter


router = APIRouter(prefix="/api/auth", tags=["auth"])
# 가입 신청·재설정 요청·코드 입력은 모두 IP별 횟수 제한을 받습니다.
auth_limiter = LoginRateLimiter(db_path=DATA_DIR / "auth_attempts.db")

USERNAME_PATTERN = r"^[A-Za-z0-9_.-]{3,50}$"


class SignupRequest(BaseModel):
    username: str = Field(pattern=USERNAME_PATTERN)
    password: str = Field(min_length=10, max_length=200)


class ResetRequest(BaseModel):
    username: str = Field(pattern=USERNAME_PATTERN)


class ResetConfirmRequest(BaseModel):
    username: str = Field(pattern=USERNAME_PATTERN)
    code: str = Field(min_length=8, max_length=20)
    new_password: str = Field(min_length=10, max_length=200)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


def _rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    client_key = hmac.new(
        ADMIN_SESSION_SECRET.encode("utf-8"), client_ip.encode("utf-8"), hashlib.sha256,
    ).hexdigest()
    retry_after = auth_limiter.reserve(client_key)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="요청이 많습니다. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": str(retry_after)},
        )


@router.post("/signup", status_code=status.HTTP_202_ACCEPTED)
def signup(payload: SignupRequest, request: Request) -> dict[str, str]:
    """가입 신청만 받습니다. 관리자가 승인하기 전에는 로그인할 수 없습니다."""
    _rate_limit(request)
    if ACCOUNT_STORE.get(payload.username) is not None:
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")
    try:
        ACCOUNT_REQUESTS.add_signup(payload.username, hash_password(payload.password))
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="이미 가입 신청이 접수되어 있습니다.") from error
    return {"status": "pending"}


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(payload: ResetRequest, request: Request) -> dict[str, str]:
    """먼저 계정이 있는지 확인합니다. 없거나 비활성이면 요청을 만들지 않고 404를 돌려줍니다.

    참고: 이 응답으로 아이디 존재 여부를 알 수 있습니다(아이디 노출). 대신 사용자가 오타를 바로 알 수 있습니다.
    """
    _rate_limit(request)
    account = ACCOUNT_STORE.get(payload.username)
    if account is None or not account.is_active:
        raise HTTPException(status_code=404, detail="해당 아이디의 계정을 찾을 수 없습니다.")
    ACCOUNT_REQUESTS.add_reset(payload.username)
    return {"status": "received"}


@router.post("/password-reset/confirm")
def confirm_password_reset(payload: ResetConfirmRequest, request: Request) -> dict[str, str]:
    _rate_limit(request)
    account = ACCOUNT_STORE.get(payload.username)
    if account is None or not account.is_active or not ACCOUNT_REQUESTS.consume_reset_code(
        payload.username, payload.code,
    ):
        raise HTTPException(status_code=400, detail="코드가 올바르지 않거나 만료되었습니다.")
    ACCOUNT_STORE.update(payload.username, password_hash=hash_password(payload.new_password))
    ACCOUNT_REQUESTS.reject("reset", payload.username)
    SESSION_STORE.revoke_user(payload.username)
    audit_log.record(
        normalize_username(payload.username), "password_reset_completed",
        ip=request.client.host if request.client else "unknown",
    )
    return {"status": "ok"}


@router.post("/password")
def change_own_password(
    payload: PasswordChangeRequest,
    request: Request,
    response: Response,
    session: AdminSession = Depends(require_user),
) -> dict[str, str]:
    _rate_limit(request)
    account = ACCOUNT_STORE.get(session.username)
    if account is None or not verify_password(payload.current_password, account.password_hash):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 맞지 않습니다.")
    new_hash = hash_password(payload.new_password)
    ACCOUNT_STORE.update(session.username, password_hash=new_hash)
    # 이 기기의 로그인은 유지하고, 같은 계정의 다른 로그인은 모두 끊습니다.
    keep_sid = session_id(request.cookies.get(SESSION_COOKIE_NAME)) or ""
    SESSION_STORE.revoke_user_except(session.username, keep_sid)
    SESSION_STORE.set_fingerprint(keep_sid, password_fingerprint(new_hash))
    audit_log.record(
        session.username, "password_changed",
        ip=request.client.host if request.client else "unknown",
    )
    return {"status": "ok"}
