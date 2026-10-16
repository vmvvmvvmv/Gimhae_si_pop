import type {
  PopulationAvailabilityItem,
  PopulationLevel,
} from './populationApi'

function monthsForLevel(
  items: readonly PopulationAvailabilityItem[],
  level: PopulationLevel,
): PopulationAvailabilityItem[] {
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
  if (requestedYm && months.some((item) => item.statsYm === requestedYm)) {
    return requestedYm
  }
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
  return earlier.find((item) => item.statsYm === previousYearYm && item.complete)?.statsYm ??
    earlier.findLast((item) => item.complete)?.statsYm ??
    earlier.at(-1)?.statsYm ?? ''
}
