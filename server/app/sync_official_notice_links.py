"""UPIS 고시와 김해시청 공식 고시공고 고유 URL을 대조해 저장합니다."""

import argparse
import asyncio
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

import httpx
from sqlalchemy import select

from .db import SessionLocal
from .models import DevelopmentNotice


OFFICIAL_LIST_URL = "https://www.gimhae.go.kr/03360/00023/00029.web"
OFFICIAL_URL_MARKER = "not_ancmt_mgt_no="
@dataclass(frozen=True)
class NoticeSnapshot:
    source_id: str
    notice_number: str
    notice_date: str
    title: str


@dataclass(frozen=True)
class OfficialCandidate:
    url: str
    notice_number: str
    notice_date: str
    title: str


@dataclass(frozen=True)
class MatchResult:
    source_id: str
    official_url: str | None
    error: str | None = None


class OfficialNoticeSearchParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.items: list[dict[str, object]] = []
        self.current: dict[str, object] | None = None
        self.capture: str | None = None

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        classes = set((attributes.get("class") or "").split())
        if tag == "li" and "li1" in classes:
            self.current = {"href": "", "title": "", "metadata": []}
            return
        if self.current is None:
            return
        if tag == "a" and not self.current["href"]:
            self.current["href"] = attributes.get("href") or ""
        elif tag == "strong" and "t1" in classes:
            self.capture = "title"
        elif tag == "span" and "t3" in classes:
            metadata = self.current["metadata"]
            assert isinstance(metadata, list)
            metadata.append("")
            self.capture = "metadata"

    def handle_data(self, data: str) -> None:
        if self.current is None or self.capture is None:
            return
        if self.capture == "title":
            self.current["title"] = str(self.current["title"]) + data
            return
        metadata = self.current["metadata"]
        assert isinstance(metadata, list)
        if metadata:
            metadata[-1] += data

    def handle_endtag(self, tag: str) -> None:
        if self.current is None:
            return
        if tag in {"strong", "span"}:
            self.capture = None
        elif tag == "li":
            self.items.append(self.current)
            self.current = None
            self.capture = None


def normalize_notice_number(value: str) -> str:
    match = re.search(r"(\d{4})\s*[-‐‑‒–—]\s*(\d+)", value)
    if not match:
        return ""
    return f"{match.group(1)}-{int(match.group(2))}"


def normalize_title(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()


def canonical_official_url(href: str) -> str:
    # HTMLParser가 &amp;를 이미 &로 복원하므로 다시 unescape하면
    # '&not_ancmt...'의 '&not'가 수학기호 엔티티로 오인됩니다.
    parsed = urlparse(urljoin(OFFICIAL_LIST_URL, href))
    query = parse_qs(parsed.query)
    management_number = query.get("not_ancmt_mgt_no", [""])[0]
    if not management_number:
        return ""
    section = query.get("section", ["01"])[0]
    canonical_query = urlencode(
        {
            "amode": "view",
            "not_ancmt_mgt_no": management_number,
            "section": section,
        },
    )
    return f"{OFFICIAL_LIST_URL}?{canonical_query}"


def parse_candidates(page_html: str) -> list[OfficialCandidate]:
    parser = OfficialNoticeSearchParser()
    parser.feed(page_html)
    candidates: list[OfficialCandidate] = []
    for item in parser.items:
        href = str(item["href"])
        title = " ".join(str(item["title"]).split())
        # 결과 메타데이터는 고시번호, 등록일, 공고기간, 담당부서, 조회수
        # 순서입니다. 한글 라벨 자체를 정규식에 넣지 않아 응답 인코딩이나
        # 문구의 미세한 변경에 덜 민감하게 처리합니다.
        raw_metadata = item["metadata"]
        assert isinstance(raw_metadata, list)
        metadata = [" ".join(str(value).split()) for value in raw_metadata]
        notice_number = metadata[0].split(":", 1)[-1].strip() if metadata else ""
        notice_date = metadata[1].split(":", 1)[-1].strip() if len(metadata) > 1 else ""
        official_url = canonical_official_url(href)
        if official_url and title and notice_number and notice_date:
            candidates.append(
                OfficialCandidate(
                    url=official_url,
                    notice_number=notice_number,
                    notice_date=notice_date,
                    title=title,
                ),
            )
    return candidates


def choose_exact_candidate(
    notice: NoticeSnapshot,
    candidates: list[OfficialCandidate],
) -> OfficialCandidate | None:
    expected_number = normalize_notice_number(notice.notice_number)
    expected_title = normalize_title(notice.title)
    eligible: list[tuple[float, OfficialCandidate]] = []

    for candidate in candidates:
        if normalize_notice_number(candidate.notice_number) != expected_number:
            continue
        if candidate.notice_date != notice.notice_date:
            continue

        candidate_title = normalize_title(candidate.title)
        similarity = SequenceMatcher(None, expected_title, candidate_title).ratio()
        if (
            similarity >= 0.45
            or candidate_title in expected_title
            or expected_title in candidate_title
        ):
            eligible.append((similarity, candidate))

    if not eligible:
        return None
    eligible.sort(key=lambda item: item[0], reverse=True)
    return eligible[0][1]


async def find_official_link(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    notice: NoticeSnapshot,
    delay_seconds: float,
) -> MatchResult:
    try:
        async with semaphore:
            if delay_seconds:
                await asyncio.sleep(delay_seconds)
            response = await client.get(
                OFFICIAL_LIST_URL,
                params={"stype": "rno", "sstring": notice.notice_number},
            )
            response.raise_for_status()
        candidate = choose_exact_candidate(notice, parse_candidates(response.text))
        return MatchResult(
            source_id=notice.source_id,
            official_url=candidate.url if candidate else None,
        )
    except (httpx.HTTPError, ValueError) as error:
        return MatchResult(
            source_id=notice.source_id,
            official_url=None,
            error=str(error),
        )


async def collect_matches(
    notices: list[NoticeSnapshot],
    *,
    concurrency: int,
    delay_seconds: float,
) -> list[MatchResult]:
    semaphore = asyncio.Semaphore(concurrency)
    headers = {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/140 Safari/537.36"
        ),
    }
    async with httpx.AsyncClient(
        headers=headers,
        follow_redirects=True,
        timeout=20,
    ) as client:
        tasks = [
            asyncio.create_task(
                find_official_link(
                    client,
                    semaphore,
                    notice,
                    delay_seconds,
                ),
            )
            for notice in notices
        ]
        results: list[MatchResult] = []
        for completed, task in enumerate(asyncio.as_completed(tasks), start=1):
            results.append(await task)
            if completed % 25 == 0 or completed == len(tasks):
                print(f"공식 링크 확인 진행: {completed}/{len(tasks)}")
        return results


def load_notices(
    *,
    limit: int | None,
    notice_number: str | None,
    refresh: bool,
) -> list[NoticeSnapshot]:
    with SessionLocal() as db:
        statement = select(DevelopmentNotice).where(
            DevelopmentNotice.is_active.is_(True),
        )
        if notice_number:
            statement = statement.where(
                DevelopmentNotice.notice_number == notice_number,
            )
        if not refresh:
            statement = statement.where(
                ~DevelopmentNotice.source_url.contains(OFFICIAL_URL_MARKER),
            )
        statement = statement.order_by(
            DevelopmentNotice.notice_date.desc(),
            DevelopmentNotice.id.desc(),
        )
        if limit is not None:
            statement = statement.limit(limit)
        rows = db.scalars(statement).all()
        return [
            NoticeSnapshot(
                source_id=row.source_id,
                notice_number=row.notice_number,
                notice_date=row.notice_date,
                title=row.title,
            )
            for row in rows
        ]


def save_matches(results: list[MatchResult]) -> int:
    matched = {
        result.source_id: result.official_url
        for result in results
        if result.official_url
    }
    if not matched:
        return 0

    with SessionLocal() as db:
        rows = db.scalars(
            select(DevelopmentNotice).where(
                DevelopmentNotice.source_id.in_(matched.keys()),
            ),
        ).all()
        for row in rows:
            row.source_url = matched[row.source_id]  # type: ignore[assignment]
        db.commit()
    return len(matched)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="UPIS 고시를 김해시청 공식 고시공고 고유 URL과 연결합니다.",
    )
    parser.add_argument("--limit", type=int)
    parser.add_argument("--notice-number")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--delay-seconds", type=float, default=0.2)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    notices = load_notices(
        limit=args.limit,
        notice_number=args.notice_number,
        refresh=args.refresh,
    )
    if not notices:
        print("확인할 고시가 없습니다.")
        return

    results = asyncio.run(
        collect_matches(
            notices,
            concurrency=max(1, args.concurrency),
            delay_seconds=max(0, args.delay_seconds),
        ),
    )
    saved_count = save_matches(results)
    error_count = sum(result.error is not None for result in results)
    print(f"김해시청 공식 고시공고 링크 저장 완료: {saved_count}개")
    print(f"공식 링크 미확인: {len(results) - saved_count - error_count}개")
    print(f"조회 오류: {error_count}개")
    for result in results:
        if result.error:
            print(f"조회 오류 - {result.source_id}: {result.error}")


if __name__ == "__main__":
    main()
