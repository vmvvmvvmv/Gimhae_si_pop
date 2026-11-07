from __future__ import annotations

import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from threading import Lock


MAX_EXPORT_MONTHS = 24
MAX_EXPORT_ROWS = 5_000
EXPORT_RATE_WINDOW_SECONDS = 60.0
EXPORT_RATE_MAX_REQUESTS = 5
EXPORT_RATE_MAX_CLIENTS = 10_000


@dataclass
class ExportLimitError(ValueError):
    status_code: int
    detail: str

    def __str__(self) -> str:
        return self.detail


class ExportRateLimiter:
    def __init__(
        self,
        window_seconds: float = EXPORT_RATE_WINDOW_SECONDS,
        max_requests: int = EXPORT_RATE_MAX_REQUESTS,
        max_clients: int = EXPORT_RATE_MAX_CLIENTS,
    ) -> None:
        self.window_seconds = window_seconds
        self.max_requests = max_requests
        self.max_clients = max_clients
        self._requests: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = Lock()

    def allow(self, client_key: str, now: float | None = None) -> bool:
        current = time.monotonic() if now is None else now
        cutoff = current - self.window_seconds
        with self._lock:
            requests = self._requests.setdefault(client_key, deque())
            while requests and requests[0] <= cutoff:
                requests.popleft()
            if len(requests) >= self.max_requests:
                return False
            requests.append(current)
            self._requests.move_to_end(client_key)
            while len(self._requests) > self.max_clients:
                self._requests.popitem(last=False)
            return True


def validate_export_request(
    scope: str,
    from_ym: str | None,
    to_ym: str | None,
    stats_ym: str | None,
    estimated_count: int,
) -> None:
    if estimated_count > MAX_EXPORT_ROWS:
        raise ExportLimitError(
            413,
            f"내보낼 수 있는 최대 행 수는 {MAX_EXPORT_ROWS:,}개입니다.",
        )

    if scope == "month":
        if stats_ym is None:
            raise ExportLimitError(400, "월별 export에는 stats_ym이 필요합니다.")
        _parse_ym(stats_ym)
        return

    if scope != "region":
        raise ExportLimitError(400, "지원하지 않는 export 범위입니다.")
    if from_ym is None or to_ym is None:
        raise ExportLimitError(
            400,
            "지역별 export에는 from_ym과 to_ym이 필요합니다.",
        )

    start = _parse_ym(from_ym)
    end = _parse_ym(to_ym)
    month_count = end - start + 1
    if month_count <= 0:
        raise ExportLimitError(400, "from_ym은 to_ym보다 빠르거나 같아야 합니다.")
    if month_count > MAX_EXPORT_MONTHS:
        raise ExportLimitError(
            400,
            f"지역별 export 기간은 최대 {MAX_EXPORT_MONTHS}개월입니다.",
        )


def _parse_ym(value: str) -> int:
    if len(value) != 6 or not value.isdigit():
        raise ExportLimitError(400, "통계월은 YYYYMM 형식이어야 합니다.")
    year = int(value[:4])
    month = int(value[4:])
    if month < 1 or month > 12:
        raise ExportLimitError(400, "통계월의 월은 01부터 12까지여야 합니다.")
    return year * 12 + month
