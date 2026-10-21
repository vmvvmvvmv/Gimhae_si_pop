import type {
  PopulationAvailabilityItem,
  PopulationLevel,
} from './populationApi'

function monthsForLevel(
  items: readonly PopulationAvailabilityItem[],
  level: PopulationLevel,
): PopulationAvailabilityItem[] {
  // YYYYMM은 자릿수가 일정하므로 문자열 오름차순이 실제 연월 순서입니다.
  return items
    .filter((item) => item.level === level)
    .sort((left, right) => left.statsYm.localeCompare(right.statsYm))
}

export function selectPopulationMonth(
  items: readonly PopulationAvailabilityItem[],
  level: PopulationLevel,
  requestedYm: string | null,
): string {
  const months = monthsForLevel(items, level)
  // 사용자가 직접 고른 월은 일부 지역 자료만 있어도 그대로 존중합니다.
  if (requestedYm && months.some((item) => item.statsYm === requestedYm)) {
    return requestedYm
  }
  // 기본값은 가장 최근의 '전체 지역이 채워진 월'입니다. 그런 월이
  // 없을 때만 가장 최근에 일부라도 저장된 월을 보여 줍니다.
  return months.findLast((item) => item.complete)?.statsYm ??
    months.at(-1)?.statsYm ?? ''
}

export function selectPopulationMonthInYear(
  items: readonly PopulationAvailabilityItem[],
  level: PopulationLevel,
  year: number,
  preferredMonth: number,
): string {
  const months = monthsForLevel(items, level).filter(
    (item) => item.statsYm.startsWith(String(year)),
  )
  const preferredYm = `${year}${String(preferredMonth).padStart(2, '0')}`
  const preferred = months.find((item) => item.statsYm === preferredYm)
  return (preferred?.complete ? preferred.statsYm : undefined) ??
    months.findLast((item) => item.complete)?.statsYm ??
    preferred?.statsYm ?? months.at(-1)?.statsYm ?? ''
}

export function selectComparisonBaseMonth(
  items: readonly PopulationAvailabilityItem[],
  level: PopulationLevel,
  targetYm: string,
  requestedYm: string,
): string {
  const months = monthsForLevel(items, level)
  if (
    requestedYm !== targetYm &&
    months.some((item) => item.statsYm === requestedYm)
  ) {
    return requestedYm
  }

  const earlier = months.filter((item) => item.statsYm < targetYm)
  const previousYearYm = `${Number(targetYm.slice(0, 4)) - 1}${targetYm.slice(4)}`
  // 전년 동월을 먼저 찾고, 없으면 비교 가능한 가장 최근 과거 월로 내려갑니다.
  return earlier.find((item) => item.statsYm === previousYearYm && item.complete)?.statsYm ??
    earlier.findLast((item) => item.complete)?.statsYm ??
    earlier.at(-1)?.statsYm ?? ''
}
