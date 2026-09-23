"""공식 원문과 연결되지 않은 개발 고시의 불일치 원인을 점검합니다.

이 명령은 데이터베이스를 수정하지 않습니다. 토지이음과 경상남도 공식
목록을 수집한 뒤 고시번호가 같은 후보를 비교해 검토용 CSV와 Markdown
요약을 만듭니다.
"""

import argparse
import asyncio
import csv
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .sync_official_notice_links import (
    OfficialCandidate,
    NoticeSnapshot,
    collect_eum_catalog_candidates,
    collect_gyeongnam_catalog_candidates,
    load_notices,
    normalize_notice_number,
    normalize_organization,
    normalize_title,
)


REASON_LABELS = {
    "exact_match": "정확 일치(재동기화 필요)",
    "date_mismatch": "날짜 불일치",
    "title_mismatch": "제목 불일치",
    "date_and_title_mismatch": "날짜·제목 불일치",
    "organization_mismatch": "발행기관 불일치",
    "no_number_candidate": "같은 고시번호 후보 없음",
}


@dataclass(frozen=True)
class AuditRow:
    notice: NoticeSnapshot
    reason: str
    candidate: OfficialCandidate | None


def candidate_source(candidate: OfficialCandidate | None) -> str:
    if candidate is None:
        return ""
    if "eum.go.kr" in candidate.url:
        return "토지이음"
    if "minwon.gyeongnam.go.kr" in candidate.url:
        return "경상남도"
    if "gimhae.go.kr" in candidate.url:
        return "김해시청"
    return "기타"


def _candidate_score(
    notice: NoticeSnapshot,
    candidate: OfficialCandidate,
) -> tuple[int, int, int]:
    """검토할 때 가장 설명력이 높은 후보를 안정적으로 고릅니다."""
    organization_matches = (
        normalize_organization(candidate.organization_name)
        == normalize_organization(notice.organization_name)
    )
    title_matches = normalize_title(candidate.title) == normalize_title(notice.title)
    date_matches = candidate.notice_date == notice.notice_date
    return (
        int(organization_matches),
        int(title_matches),
        int(date_matches),
    )


def classify_notice(
    notice: NoticeSnapshot,
    candidates: list[OfficialCandidate],
) -> AuditRow:
    expected_number = normalize_notice_number(notice.notice_number)
    same_number = [
        candidate
        for candidate in candidates
        if normalize_notice_number(candidate.notice_number) == expected_number
    ]
    if not same_number:
        return AuditRow(notice, "no_number_candidate", None)

    same_organization = [
        candidate
        for candidate in same_number
        if normalize_organization(candidate.organization_name)
        == normalize_organization(notice.organization_name)
    ]
    if not same_organization:
        best = max(same_number, key=lambda item: _candidate_score(notice, item))
        return AuditRow(notice, "organization_mismatch", best)

    best = max(same_organization, key=lambda item: _candidate_score(notice, item))
    title_matches = normalize_title(best.title) == normalize_title(notice.title)
    date_matches = best.notice_date == notice.notice_date
    if title_matches and date_matches:
        reason = "exact_match"
    elif title_matches:
        reason = "date_mismatch"
    elif date_matches:
        reason = "title_mismatch"
    else:
        reason = "date_and_title_mismatch"
    return AuditRow(notice, reason, best)


def deduplicate_candidates(
    candidates: list[OfficialCandidate],
) -> list[OfficialCandidate]:
    unique: dict[str, OfficialCandidate] = {}
    for candidate in candidates:
        unique[candidate.url] = candidate
    return list(unique.values())


def write_csv(rows: list[AuditRow], path: Path) -> None:
    fieldnames = [
        "분류",
        "발행기관",
        "고시번호",
        "UPIS 날짜",
        "UPIS 제목",
        "후보 출처",
        "후보 기관",
        "후보 날짜",
        "후보 제목",
        "후보 URL",
        "source_id",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            candidate = row.candidate
            writer.writerow(
                {
                    "분류": REASON_LABELS[row.reason],
                    "발행기관": row.notice.organization_name,
                    "고시번호": row.notice.notice_number,
                    "UPIS 날짜": row.notice.notice_date,
                    "UPIS 제목": row.notice.title,
                    "후보 출처": candidate_source(candidate),
                    "후보 기관": candidate.organization_name if candidate else "",
                    "후보 날짜": candidate.notice_date if candidate else "",
                    "후보 제목": candidate.title if candidate else "",
                    "후보 URL": candidate.url if candidate else "",
                    "source_id": row.notice.source_id,
                },
            )


def write_markdown(rows: list[AuditRow], path: Path, candidate_count: int) -> None:
    reason_counts = Counter(row.reason for row in rows)
    organization_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        organization_counts[row.notice.organization_name][row.reason] += 1

    lines = [
        "# 공식 고시 미연결 원인 점검",
        "",
        f"- 점검일: {date.today().isoformat()}",
        f"- 미연결 고시: {len(rows):,}건",
        f"- 비교한 공식 목록 후보: {candidate_count:,}건",
        "- 주의: 이 보고서는 링크를 자동 저장하지 않는 검토 자료입니다.",
        "",
        "## 전체 분류",
        "",
        "| 원인 | 건수 |",
        "| --- | ---: |",
    ]
    for reason, label in REASON_LABELS.items():
        lines.append(f"| {label} | {reason_counts[reason]:,} |")

    lines.extend(
        [
            "",
            "## 기관별 분류",
            "",
            "| 발행기관 | 미연결 | 번호 후보 없음 | 기관 불일치 | 날짜 불일치 | 제목 불일치 | 날짜·제목 불일치 | 정확 일치 |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ],
    )
    for organization in sorted(organization_counts):
        counts = organization_counts[organization]
        lines.append(
            "| " + " | ".join(
                [
                    organization,
                    f"{sum(counts.values()):,}",
                    f"{counts['no_number_candidate']:,}",
                    f"{counts['organization_mismatch']:,}",
                    f"{counts['date_mismatch']:,}",
                    f"{counts['title_mismatch']:,}",
                    f"{counts['date_and_title_mismatch']:,}",
                    f"{counts['exact_match']:,}",
                ],
            ) + " |",
        )

    lines.extend(
        [
            "",
            "## 해석 기준",
            "",
            "- `같은 고시번호 후보 없음`: 수집한 공식 목록에서 번호가 같은 문서를 찾지 못했습니다.",
            "- `발행기관 불일치`: 번호는 같지만 UPIS와 공식 목록의 발행기관이 다릅니다.",
            "- `날짜 불일치`: 번호·기관·제목은 같고 게시일만 다릅니다.",
            "- `제목 불일치`: 번호·기관·날짜는 같고 제목만 다릅니다.",
            "- `날짜·제목 불일치`: 번호·기관만 같아 수동 확인이 필요합니다.",
            "- `정확 일치`: 현재 엄격 기준에도 맞으므로 공식 링크 동기화를 다시 실행할 대상입니다.",
            "",
            "경상남도 목록은 공식 게시판에서 제목에 `김해`가 포함된 자료를 대상으로 수집합니다. 따라서 `같은 고시번호 후보 없음`은 공식 문서가 절대 없다는 뜻이 아니라, 현재 검색 범위에서 확인하지 못했다는 뜻입니다.",
            "",
            "전체 건별 비교 결과는 같은 폴더의 CSV 파일에서 확인할 수 있습니다.",
            "",
        ],
    )
    path.write_text("\n".join(lines), encoding="utf-8")


async def run_audit(
    notices: list[NoticeSnapshot],
    *,
    concurrency: int,
    delay_seconds: float,
) -> tuple[list[AuditRow], int]:
    eum_candidates = await collect_eum_catalog_candidates(
        notices,
        concurrency=concurrency,
        delay_seconds=delay_seconds,
    )
    gyeongnam_notices = [
        notice
        for notice in notices
        if normalize_organization(notice.organization_name) == "경상남도"
    ]
    gyeongnam_candidates = await collect_gyeongnam_catalog_candidates(
        gyeongnam_notices,
        concurrency=1,
        delay_seconds=delay_seconds,
    )
    candidates = deduplicate_candidates(eum_candidates + gyeongnam_candidates)
    rows = [classify_notice(notice, candidates) for notice in notices]
    rows.sort(
        key=lambda row: (
            row.reason,
            row.notice.organization_name,
            row.notice.notice_date,
            row.notice.notice_number,
        ),
    )
    return rows, len(candidates)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="공식 원문 미연결 고시의 불일치 원인을 점검합니다.",
    )
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--delay-seconds", type=float, default=0.2)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/reports"),
    )
    args = parser.parse_args()

    notices = load_notices(
        limit=None,
        notice_number=None,
        organization_name=None,
        refresh=False,
    )
    if not notices:
        print("점검할 미연결 고시가 없습니다.")
        return

    rows, candidate_count = asyncio.run(
        run_audit(
            notices,
            concurrency=max(1, args.concurrency),
            delay_seconds=max(0, args.delay_seconds),
        ),
    )
    args.output_dir.mkdir(parents=True, exist_ok=True)
    suffix = date.today().strftime("%Y%m%d")
    csv_path = args.output_dir / f"official_notice_mismatch_audit_{suffix}.csv"
    markdown_path = args.output_dir / f"official_notice_mismatch_audit_{suffix}.md"
    write_csv(rows, csv_path)
    write_markdown(rows, markdown_path, candidate_count)

    counts = Counter(row.reason for row in rows)
    print(f"미연결 고시 점검 완료: {len(rows)}건")
    for reason, label in REASON_LABELS.items():
        print(f"- {label}: {counts[reason]}건")
    print(f"요약: {markdown_path.resolve()}")
    print(f"전체 CSV: {csv_path.resolve()}")


if __name__ == "__main__":
    main()
