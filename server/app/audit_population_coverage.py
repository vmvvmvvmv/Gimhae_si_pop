"""저장된 인구 자료의 빈 월과 전국 비교 자료를 읽기 전용으로 점검합니다."""

import argparse
import sqlite3
from collections import Counter
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from .services.national_admin_matching import match_population_code, population_name_index


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "gimhae_population.db"
AGE_GROUPS = (
    "0-9세", "10-19세", "20-29세", "30-39세", "40-49세", "50-59세",
    "60-69세", "70-79세", "80-89세", "90-99세", "100세 이상",
)
REQUIRED_TABLES = (
    "regions", "population_monthly", "population_age_monthly",
    "national_population_monthly", "national_area_annual",
    "national_administrative_area", "national_administrative_population_monthly",
)
CATEGORY_LABELS = {
    "no_regions": "활성 지역 없음",
    "no_population": "지역 인구 자료 없음",
    "population": "지역·월별 인구 누락",
    "age": "연령대 일부/전체 누락",
    "national_population": "전국 월별 인구 누락",
    "national_area": "전국 연도별 면적 누락",
    "comparison_area": "전국 행정동 면적 누락",
    "comparison_population": "전국 행정동 인구 미연결",
}


@dataclass(frozen=True)
class Issue:
    category: str
    level: str
    stats_ym: str
    region_code: str
    detail: str


def valid_month(value: str) -> bool:
    return len(value) == 6 and value.isascii() and value.isdigit() and 1 <= int(value[4:]) <= 12


def months_between(first: str, last: str):
    start = int(first[:4]) * 12 + int(first[4:]) - 1
    end = int(last[:4]) * 12 + int(last[4:]) - 1
    for index in range(start, end + 1):
        yield f"{index // 12:04d}{index % 12 + 1:02d}"


def audit(conn: sqlite3.Connection, from_ym: str | None = None, to_ym: str | None = None) -> list[Issue]:
    """각 유형의 관측 기간을 기준으로 활성 지역의 자료 누락을 찾습니다."""
    conn.row_factory = sqlite3.Row
    existing = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    missing_tables = set(REQUIRED_TABLES) - existing
    if missing_tables:
        raise ValueError(f"필요한 테이블이 없습니다: {', '.join(sorted(missing_tables))}")

    regions = conn.execute(
        "SELECT id, level, region_code, region_name FROM regions "
        "WHERE is_active = 1 AND level IN ('admin', 'legal') ORDER BY level, region_code"
    ).fetchall()
    population = {
        (row[0], row[1]) for row in conn.execute(
            "SELECT region_id, stats_ym FROM population_monthly"
        ) if valid_month(row[1])
    }
    ages: dict[tuple[int, str], set[str]] = {}
    for region_id, month, group in conn.execute(
        "SELECT region_id, stats_ym, age_group FROM population_age_monthly"
    ):
        ages.setdefault((region_id, month), set()).add(group)

    national_population = {
        row[0] for row in conn.execute("SELECT stats_ym FROM national_population_monthly")
    }
    national_area_years = {
        row[0] for row in conn.execute("SELECT year FROM national_area_annual")
    }
    area_by_year: dict[int, set[tuple[str, str]]] = {}
    for year, code, name in conn.execute(
        "SELECT boundary_year, region_code, region_name FROM national_administrative_area"
    ):
        area_by_year.setdefault(year, set()).add((code, name))
    comparison_by_month: dict[str, set[tuple[str, str]]] = {}
    for month, code, name in conn.execute(
        "SELECT stats_ym, region_code, region_name FROM national_administrative_population_monthly"
    ):
        comparison_by_month.setdefault(month, set()).add((code, name))

    issues: list[Issue] = []
    by_level: dict[str, list[sqlite3.Row]] = {"admin": [], "legal": []}
    for region in regions:
        by_level[region["level"]].append(region)

    if not regions:
        return [Issue("no_regions", "전체", "", "", "활성 행정동·법정동이 없음")]

    for level, level_regions in by_level.items():
        if not level_regions:
            continue
        ids = {region["id"] for region in level_regions}
        observed = sorted(month for region_id, month in population if region_id in ids)
        if not observed:
            issues.append(Issue("no_population", level, "", "", "저장된 인구 월이 없음"))
            continue
        start = max(observed[0], from_ym or observed[0])
        end = min(observed[-1], to_ym or observed[-1])
        if start > end:
            issues.append(Issue("no_population", level, "", "",
                                f"요청 범위와 저장 기간({observed[0]}~{observed[-1]})이 겹치지 않음"))
            continue
        for month in months_between(start, end):
            for region in level_regions:
                key = (region["id"], month)
                label = region["region_name"]
                if key not in population:
                    issues.append(Issue("population", level, month, region["region_code"], label))
                    continue
                missing_groups = set(AGE_GROUPS) - ages.get(key, set())
                if missing_groups:
                    ordered = [group for group in AGE_GROUPS if group in missing_groups]
                    issues.append(Issue("age", level, month, region["region_code"],
                                        f"{label}: {', '.join(ordered)}"))

        if level != "admin":
            continue
        for month in months_between(start, end):
            if month not in national_population:
                issues.append(Issue("national_population", level, month, "", "전국 월별 인구 없음"))
            if int(month[:4]) not in national_area_years:
                issues.append(Issue("national_area", level, month, "", "해당 연도 전국 면적 없음"))
            years = [year for year in area_by_year if year <= int(month[:4])]
            year = max(years) if years else max(area_by_year, default=None)
            if year is None:
                issues.append(Issue("comparison_area", level, month, "", "전국 행정동 면적 없음"))
                continue
            candidates = area_by_year[year]
            available = comparison_by_month.get(month, set())
            codes = {code for code, _ in available}
            names = population_name_index(available)
            missing_count = sum(
                match_population_code(code, name, codes, names) is None
                for code, name in candidates
            )
            if missing_count:
                issues.append(Issue("comparison_population", level, month, "",
                                    f"면적 기준 {year}년 {len(candidates)}개 중 인구 미연결 {missing_count}개"))
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-ym", help="점검 시작월 YYYYMM (기본: 저장된 첫 달)")
    parser.add_argument("--to-ym", help="점검 종료월 YYYYMM (기본: 저장된 마지막 달)")
    parser.add_argument("--limit", type=int, default=30, help="상세 예시 최대 건수 (기본 30)")
    args = parser.parse_args()
    for month in (args.from_ym, args.to_ym):
        if month is not None and not valid_month(month):
            parser.error("연월은 유효한 YYYYMM 형식이어야 합니다.")
    if args.from_ym and args.to_ym and args.from_ym > args.to_ym:
        parser.error("시작월은 종료월보다 늦을 수 없습니다.")
    if args.limit < 0:
        parser.error("--limit은 0 이상이어야 합니다.")
    if not DATABASE_PATH.is_file():
        parser.error(f"DB 파일을 찾을 수 없습니다: {DATABASE_PATH}")

    try:
        with closing(sqlite3.connect(f"{DATABASE_PATH.as_uri()}?mode=ro", uri=True)) as conn:
            issues = audit(conn, args.from_ym, args.to_ym)
    except (sqlite3.Error, ValueError) as error:
        parser.error(str(error))

    counts = Counter((issue.level, issue.category) for issue in issues)
    print("인구 데이터 누락 점검 (읽기 전용)")
    print("범위: 유형별 저장된 첫 달~마지막 달; 활성 지역 기준")
    if args.from_ym or args.to_ym:
        print(f"요청 범위: {args.from_ym or '처음'}~{args.to_ym or '마지막'} (저장된 기간과 교집합)")
    print("행정구역 변경 전후의 빈 월은 자동으로 확정하지 않고 확인이 필요합니다.")
    for (level, category), count in sorted(counts.items()):
        print(f"{level} / {CATEGORY_LABELS[category]}: {count}건")
    if not issues:
        print("점검 범위에서 누락을 찾지 못했습니다.")
    for issue in issues[:args.limit]:
        print(f"- {issue.level} {issue.stats_ym} {issue.region_code} [{CATEGORY_LABELS[issue.category]}] {issue.detail}")
    if len(issues) > args.limit:
        print(f"... 그 외 {len(issues) - args.limit}건 (--limit으로 조정)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
