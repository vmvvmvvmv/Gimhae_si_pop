from typing import Literal
import hashlib
import hmac
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ..core.config import ADMIN_COOKIE_SECURE, ADMIN_SESSION_SECRET, ADMIN_SESSION_TTL_SECONDS
from ..services.account_store import LastAdminError
from ..services.account_requests import RESET, SIGNUP
from ..services.admin_auth import (
    ACCOUNT_REQUESTS,
    ACCOUNT_STORE,
    SESSION_COOKIE_NAME,
    SESSION_STORE,
    AdminSession,
    admin_auth_configured,
    authenticate_account,
    hash_password,
    require_admin,
    read_session,
    revoke_session,
)
from ..services.admin_sync_service import (
    SyncAlreadyRunning,
    SyncJobManager,
)
from ..services.admin_login_limit import LoginRateLimiter


router = APIRouter(prefix="/api/admin", tags=["admin"])
sync_jobs = SyncJobManager()
login_limiter = LoginRateLimiter()


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class PopulationSyncRequest(BaseModel):
    level: Literal["admin", "legal"] = "admin"
    from_ym: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    to_ym: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post("/login")
def admin_login(payload: LoginRequest, response: Response, request: Request) -> dict[str, str]:
    if not admin_auth_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="관리자 인증이 설정되지 않았습니다.",
        )
    client_ip = request.client.host if request.client else "unknown"
    client_key = hmac.new(
        ADMIN_SESSION_SECRET.encode("utf-8"), client_ip.encode("utf-8"), hashlib.sha256,
    ).hexdigest()
    retry_after = login_limiter.reserve(client_key)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": str(retry_after)},
        )
    account = authenticate_account(payload.username, payload.password)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 올바르지 않습니다.",
        )
    login_limiter.clear(client_key)

    from ..services.admin_auth import issue_session, password_fingerprint

    # 검증에 쓴 해시의 지문을 그대로 넘깁니다. 검증 뒤에 비밀번호가 바뀌었다면 이 세션은 바로 무효입니다.
    response.set_cookie(
        SESSION_COOKIE_NAME,
        issue_session(payload.username, pwd_fp=password_fingerprint(account.password_hash)),
        max_age=ADMIN_SESSION_TTL_SECONDS,
        httponly=True,
        secure=ADMIN_COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    return {"status": "ok"}


@router.get("/session")
def admin_session(request: Request) -> dict[str, object]:
    session = read_session(request.cookies.get(SESSION_COOKIE_NAME))
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="관리자 로그인이 필요합니다.",
        )
    return {"authenticated": True, "username": session.username, "role": session.role}


class CreateUserRequest(BaseModel):
    username: str = Field(pattern=r"^[A-Za-z0-9_.-]{3,50}$")
    password: str = Field(min_length=10, max_length=200)
    role: Literal["admin", "user"] = "user"


class UpdateUserRequest(BaseModel):
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=200)


def _account_json(account) -> dict[str, object]:
    return {
        "username": account.username,
        "role": account.role,
        "isActive": account.is_active,
        "createdAt": account.created_at,
    }


@router.get("/users")
def list_users(_: object = Depends(require_admin)) -> dict[str, object]:
    return {"items": [_account_json(a) for a in ACCOUNT_STORE.list()]}


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: CreateUserRequest, _: object = Depends(require_admin)) -> dict[str, object]:
    try:
        ACCOUNT_STORE.create(payload.username, hash_password(payload.password), payload.role)
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="이미 있는 아이디입니다.") from error
    return _account_json(ACCOUNT_STORE.get(payload.username))


@router.patch("/users/{username}")
def update_user(
    username: str,
    payload: UpdateUserRequest,
    admin: AdminSession = Depends(require_admin),
) -> dict[str, object]:
    if ACCOUNT_STORE.get(username) is None:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")
    if payload.is_active is False and username == admin.username:
        raise HTTPException(status_code=409, detail="지금 로그인한 계정은 비활성화할 수 없습니다.")
    try:
        if payload.is_active is not None:
            ACCOUNT_STORE.set_active(username, payload.is_active)
    except LastAdminError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.") from error
    if payload.password is not None:
        ACCOUNT_STORE.update(username, password_hash=hash_password(payload.password))
    # 변경 뒤에 세션을 지웁니다. 비활성화·비밀번호 초기화 전에 만든 세션이 남지 않게 합니다.
    if payload.is_active is False or payload.password is not None:
        SESSION_STORE.revoke_user(username)
    return _account_json(ACCOUNT_STORE.get(username))


def _request_json(item) -> dict[str, object]:
    return {
        "kind": item.kind,
        "username": item.username,
        "createdAt": item.created_at,
        "codeIssued": item.code_issued,
    }


@router.get("/requests")
def list_requests(
    kind: Literal["signup", "reset"] = "signup",
    _: object = Depends(require_admin),
) -> dict[str, object]:
    return {"items": [_request_json(item) for item in ACCOUNT_REQUESTS.list(kind)]}


@router.post("/requests/signup/{username}/approve", status_code=status.HTTP_201_CREATED)
def approve_signup(username: str, _: object = Depends(require_admin)) -> dict[str, object]:
    password_hash = ACCOUNT_REQUESTS.take_signup(username)
    if password_hash is None:
        raise HTTPException(status_code=404, detail="대기 중인 가입 신청을 찾을 수 없습니다.")
    try:
        ACCOUNT_STORE.create(username, password_hash, "user")
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.") from error
    return _account_json(ACCOUNT_STORE.get(username))


@router.post("/requests/signup/{username}/reject")
def reject_signup(username: str, _: object = Depends(require_admin)) -> dict[str, str]:
    if not ACCOUNT_REQUESTS.reject(SIGNUP, username):
        raise HTTPException(status_code=404, detail="대기 중인 가입 신청을 찾을 수 없습니다.")
    return {"status": "rejected"}


@router.post("/requests/reset/{username}/approve")
def approve_reset(username: str, _: object = Depends(require_admin)) -> dict[str, object]:
    """일회용 코드는 이 응답에서 한 번만 보입니다. 관리자가 사용자에게 직접 전달합니다."""
    code = ACCOUNT_REQUESTS.issue_reset_code(username)
    if code is None:
        raise HTTPException(status_code=404, detail="대기 중인 재설정 요청을 찾을 수 없습니다.")
    return {"username": username, "code": code, "expiresInMinutes": 30}


@router.post("/requests/reset/{username}/reject")
def reject_reset(username: str, _: object = Depends(require_admin)) -> dict[str, str]:
    if not ACCOUNT_REQUESTS.reject(RESET, username):
        raise HTTPException(status_code=404, detail="대기 중인 재설정 요청을 찾을 수 없습니다.")
    return {"status": "rejected"}


@router.post("/logout")
def admin_logout(request: Request, response: Response) -> dict[str, str]:
    # 쿠키만 지우면 복사해 둔 토큰이 만료 전까지 남으므로 서버 기록도 지웁니다.
    revoke_session(request.cookies.get(SESSION_COOKIE_NAME))
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"status": "ok"}


@router.post("/sync/population", status_code=status.HTTP_202_ACCEPTED)
def start_population_sync(
    payload: PopulationSyncRequest,
    _: object = Depends(require_admin),
) -> dict[str, object]:
    try:
        return sync_jobs.start_population_sync(
            payload.level,
            payload.from_ym,
            payload.to_ym,
        )
    except SyncAlreadyRunning as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/sync")
def list_population_syncs(
    _: object = Depends(require_admin),
) -> dict[str, object]:
    return {"items": sync_jobs.list_jobs()}


@router.get("/sync/{job_id}")
def get_population_sync(
    job_id: str,
    _: object = Depends(require_admin),
) -> dict[str, object]:
    job = sync_jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="동기화 작업을 찾을 수 없습니다.")
    return job
