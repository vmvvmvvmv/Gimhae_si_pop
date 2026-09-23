"""UPIS 고시와 발행기관이 등재한 공식 고시 원문을 대조해 저장합니다."""

import argparse
import asyncio
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

import httpx
from sqlalchemy import or_, select

from .db import SessionLocal
from .models import DevelopmentNotice


OFFICIAL_LIST_URL = "https://www.gimhae.go.kr/03360/00023/00029.web"
EUM_LIST_URL = "https://www.eum.go.kr/web/gs/gv/gvGosiList.jsp"
EUM_DETAIL_URL = "https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp"
OFFICIAL_URL_MARKERS = ("not_ancmt_mgt_no=", "/web/gs/gv/gvGosiDet.jsp?seq=")


@dataclass(frozen=True)
class NoticeSnapshot:
    source_id: str
    notice_number: str
    notice_date: str
    title: str
    organization_name: str


@dataclass(frozen=True)
class OfficialCandidate:
    url: str
    notice_number: str
    notice_date: str
    title: str
    organization_name: str = ""


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
                    organization_name="김해시",
                ),
            )
    return candidates


class EumNoticeSearchParser(HTMLParser):
    """토지이음 고시 목록의 표 행을 읽습니다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[dict[str, str]]] = []
        self.current_row: list[dict[str, str]] | None = None
        self.current_cell: dict[str, str] | None = None

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        classes = set((attributes.get("class") or "").split())
        if tag == "tr" and "center" in classes:
            self.current_row = []
            return
        if self.current_row is None:
            return
        if tag == "td":
            self.current_cell = {
                "text": "",
                "title": attributes.get("title") or "",
                "href": "",
                "link_title": "",
            }
            self.current_row.append(self.current_cell)
        elif tag == "a" and self.current_cell is not None:
            self.current_cell["href"] = attributes.get("href") or ""
            self.current_cell["link_title"] = attributes.get("title") or ""

    def handle_data(self, data: str) -> None:
        if self.current_cell is not None:
            self.current_cell["text"] += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "td":
            self.current_cell = None
        elif tag == "tr" and self.current_row is not None:
            self.rows.append(self.current_row)
            self.current_row = None
            self.current_cell = None


def canonical_eum_url(href: str) -> str:
    parsed = urlparse(urljoin(EUM_LIST_URL, href))
    sequence = parse_qs(parsed.query).get("seq", [""])[0]
    if not sequence.isdigit():
        return ""
    return f"{EUM_DETAIL_URL}?seq={sequence}"


def parse_eum_candidates(page_html: str) -> list[OfficialCandidate]:
    parser = EumNoticeSearchParser()
    parser.feed(page_html)
    candidates: list[OfficialCandidate] = []
    for cells in parser.rows:
        if len(cells) < 4:
            continue
        href = cells[2]["href"]
        official_url = canonical_eum_url(href)
        title = " ".join((cells[2]["link_title"] or cells[2]["text"]).split())
        notice_number = " ".join((cells[1]["title"] or cells[1]["text"]).split())
        notice_date = " ".join(cells[0]["text"].split())
        organization_name = " ".join(
            (cells[3]["title"] or cells[3]["text"]).split()
        )
        if official_url and title and notice_number and notice_date:
            candidates.append(
                OfficialCandidate(
                    url=official_url,
                    notice_number=notice_number,
                    notice_date=notice_date,
                    title=title,
                    organization_name=organization_name,
                ),
            )
    return candidates


def normalize_organization(value: str) -> str:
    compact = re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()
    if compact in {"김해시", "경상남도김해시"}:
        return "김해시"
    return compact


def choose_exact_candidate(
    notice: NoticeSnapshot,
    candidates: list[OfficialCandidate],
) -> OfficialCandidate | None:
    expected_number = normalize_notice_number(notice.notice_number)
    expected_title = normalize_title(notice.title)
    for candidate in candidates:
        if normalize_notice_number(candidate.notice_number) != expected_number:
            continue
        if candidate.notice_date != notice.notice_date:
            continue
        if normalize_title(candidate.title) != expected_title:
            continue
        if (
            candidate.organization_name
            and normalize_organization(candidate.organization_name)
            != normalize_organization(notice.organization_name)
        ):
            continue
        return candidate
    return None


async def find_official_link(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    notice: NoticeSnapshot,
    delay_seconds: float,
) -> MatchResult:
    errors: list[str] = []

    if normalize_organization(notice.organization_name) == "김해시":
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
            if candidate:
                return MatchResult(notice.source_id, candidate.url)
        except (httpx.HTTPError, ValueError) as error:
            errors.append(f"김해시청: {error}")

    try:
        async with semaphore:
            if delay_seconds:
                await asyncio.sleep(delay_seconds)
            response = await client.get(
                EUM_LIST_URL,
                params={"gosino": normalize_notice_number(notice.notice_number)},
            )
            response.raise_for_status()
        page_html = response.content.decode("euc-kr", errors="replace")
        candidate = choose_exact_candidate(notice, parse_eum_candidates(page_html))
        return MatchResult(
            source_id=notice.source_id,
            official_url=candidate.url if candidate else None,
            error="; ".join(errors) or None,
        )
    except (httpx.HTTPError, ValueError) as error:
        errors.append(f"토지이음: {error}")
        return MatchResult(
            source_id=notice.source_id,
            official_url=None,
            error="; ".join(errors),
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


async def fetch_eum_catalog_page(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    *,
    page: int,
    from_date: str,
    to_date: str,
    delay_seconds: float,
) -> tuple[str, list[OfficialCandidate]]:
    async with semaphore:
        if delay_seconds:
            await asyncio.sleep(delay_seconds)
        response = await client.get(
            EUM_LIST_URL,
            params={
                "selSggCd": "4825000000",
                "listSize": 100,
                "pageNo": page,
                "startdt": from_date,
                "enddt": to_date,
            },
        )
        response.raise_for_status()
    page_html = response.content.decode("euc-kr", errors="replace")
    return page_html, parse_eum_candidates(page_html)


async def collect_eum_catalog_matches(
    notices: list[NoticeSnapshot],
    *,
    concurrency: int,
    delay_seconds: float,
) -> list[MatchResult]:
    """김해시 고시 목록을 페이지별로 받은 뒤 로컬에서 정확 대조합니다."""
    if not notices:
        return []

    from_date = min(notice.notice_date for notice in notices)
    to_date = max(notice.notice_date for notice in notices)
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
        timeout=60,
    ) as client:
        first_html, first_candidates = await fetch_eum_catalog_page(
            client,
            semaphore,
            page=1,
            from_date=from_date,
            to_date=to_date,
            delay_seconds=delay_seconds,
        )
        page_numbers = [
            int(value)
            for value in re.findall(
                r'pageNo=(\d+)[^\"]*\" title=\"마지막 페이지로 이동',
                first_html,
            )
        ]
        total_pages = max(page_numbers, default=1)
        print(
            f"토지이음 김해시 고시 목록: {from_date}~{to_date}, "
            f"{total_pages}페이지"
        )

        candidates = list(first_candidates)
        tasks = [
            asyncio.create_task(
                fetch_eum_catalog_page(
                    client,
                    semaphore,
                    page=page,
                    from_date=from_date,
                    to_date=to_date,
                    delay_seconds=delay_seconds,
                ),
            )
            for page in range(2, total_pages + 1)
        ]
        try:
            for completed, task in enumerate(asyncio.as_completed(tasks), start=2):
                _, page_candidates = await task
                candidates.extend(page_candidates)
                if completed % 5 == 0 or completed == total_pages:
                    print(f"토지이음 목록 수집: {completed}/{total_pages}페이지")
        except Exception:
            for task in tasks:
                task.cancel()
            raise

    print(f"토지이음 공식 고시 후보: {len(candidates)}건")
    return [
        MatchResult(
            source_id=notice.source_id,
            official_url=(candidate.url if candidate else None),
        )
        for notice in notices
        for candidate in [choose_exact_candidate(notice, candidates)]
    ]


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
                ~or_(
                    *(
                        DevelopmentNotice.source_url.contains(marker)
                        for marker in OFFICIAL_URL_MARKERS
                    ),
                ),
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
                organization_name=row.organization_name or "김해시",
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
        description="UPIS 고시를 발행기관의 공식 고시 원문과 연결합니다.",
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

    collector = collect_matches if args.notice_number else collect_eum_catalog_matches
    results = asyncio.run(
        collector(
            notices,
            concurrency=max(1, args.concurrency),
            delay_seconds=max(0, args.delay_seconds),
        ),
    )
    saved_count = save_matches(results)
    error_count = sum(result.error is not None for result in results)
    print(f"공식 고시 원문 링크 저장 완료: {saved_count}개")
    print(f"공식 링크 미확인: {len(results) - saved_count - error_count}개")
    print(f"조회 오류: {error_count}개")
    for result in results:
        if result.error:
            print(f"조회 오류 - {result.source_id}: {result.error}")


if __name__ == "__main__":
    main()
