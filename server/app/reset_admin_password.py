"""관리자 비밀번호를 서버에서 직접 되돌리는 복구 도구입니다.

관리자 로그인을 잃었을 때 씁니다. 배포 환경에서는 다음처럼 실행합니다.

    docker compose exec app python -m app.reset_admin_password admin

비밀번호는 입력창에서 두 번 입력받습니다. 자동화할 때만 --password-stdin을 씁니다.
비밀번호를 명령줄 인자로 주지 않는 이유는 셸 기록에 남지 않게 하기 위해서입니다.
"""

import argparse
import getpass
import sys

from .services import audit_log
from .services.account_store import normalize_username
from .services.admin_auth import ACCOUNT_STORE, SESSION_STORE, hash_password

MIN_PASSWORD_LENGTH = 10


def restore_admin(username: str, password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다.")
    ACCOUNT_STORE.force_admin(username, hash_password(password))
    # 이전 비밀번호로 만든 로그인은 모두 끊습니다.
    SESSION_STORE.revoke_user(username)
    audit_log.record("server-cli", "admin_recovery", normalize_username(username))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="관리자 계정 비밀번호 복구")
    parser.add_argument("username")
    parser.add_argument("--password-stdin", action="store_true",
                        help="표준 입력의 첫 줄을 비밀번호로 사용합니다(자동화용).")
    args = parser.parse_args(argv)

    if args.password_stdin:
        password = sys.stdin.readline().rstrip("\n")
    else:
        password = getpass.getpass("새 비밀번호: ")
        if password != getpass.getpass("새 비밀번호 확인: "):
            print("비밀번호가 서로 다릅니다.", file=sys.stderr)
            return 1
    try:
        restore_admin(args.username, password)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    print(f"{args.username} 계정을 활성 관리자로 복구했습니다. 기존 로그인은 끊겼습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
