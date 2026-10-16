"""SGIS 면적과 KOSIS 인구의 서로 다른 행정동 코드를 안전하게 대조합니다."""

import re
from collections import defaultdict
from collections.abc import Iterable


def normalize_name(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value)


def population_name_index(rows: Iterable[tuple[str, str]]) -> dict[str, set[str]]:
    index: dict[str, set[str]] = defaultdict(set)
    for code, name in rows:
        index[normalize_name(name)].add(code)
    return dict(index)


def _name_variants(area_name: str) -> list[str]:
    parts = area_name.split()
    variants = [area_name]
    if len(parts) >= 4 and parts[-2].endswith("구") and parts[-3].endswith("시"):
        variants.append(" ".join([*parts[:-3], *parts[-2:]]))
    if len(parts) == 3 and parts[0] == "세종특별자치시" and parts[1] == "세종시":
        variants.append("세종특별자치시 세종특별자치시 " + parts[-1])

    with_number_variants = []
    for variant in variants:
        words = variant.split()
        if words and re.search(r"\d.*동$", words[-1]):
            for match in re.finditer(r"\d+", words[-1]):
                numbered = words.copy()
                numbered[-1] = words[-1][:match.start()] + "제" + words[-1][match.start():]
                with_number_variants.append(" ".join(numbered))
    return variants + with_number_variants


def match_population_code(
    area_code: str,
    area_name: str,
    population_codes: set[str],
    names: dict[str, set[str]],
) -> str | None:
    if area_code in population_codes:
        return area_code
    variants = _name_variants(area_name)
    exact = names.get(normalize_name(variants[0]), set())
    if exact:
        return next(iter(exact)) if len(exact) == 1 else None
    possible = set().union(*(names.get(normalize_name(variant), set()) for variant in variants[1:]))
    return next(iter(possible)) if len(possible) == 1 else None
