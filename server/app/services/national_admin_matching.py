"""SGIS 면적과 KOSIS 인구의 서로 다른 행정동 코드를 안전하게 대조합니다."""

import re
from collections import defaultdict
from collections.abc import Iterable


def normalize_name(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value)


def population_name_index(rows: Iterable[tuple[str, str]]) -> dict[str, set[str]]:
    # 같은 이름이 여러 코드에 해당할 수 있어 값은 단일 코드가 아닌 집합입니다.
    index: dict[str, set[str]] = defaultdict(set)
    for code, name in rows:
        index[normalize_name(name)].add(code)
    return dict(index)


def _name_variants(area_name: str) -> list[str]:
    # 기관마다 '시 구 동', '구 동', 숫자 동의 '제' 표기가 달라질 수 있습니다.
    # 가능한 표기를 만들되, 실제 연결은 아래에서 유일한 후보일 때만 합니다.
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
    # 원본 코드가 같으면 이름 변형 없이 바로 사용합니다.
    if area_code in population_codes:
        return area_code
    variants = _name_variants(area_name)
    exact = names.get(normalize_name(variants[0]), set())
    if exact:
        # 이름이 같아도 후보가 둘 이상이면 임의로 하나를 고르지 않습니다.
        return next(iter(exact)) if len(exact) == 1 else None
    possible = set().union(*(names.get(normalize_name(variant), set()) for variant in variants[1:]))
    return next(iter(possible)) if len(possible) == 1 else None
