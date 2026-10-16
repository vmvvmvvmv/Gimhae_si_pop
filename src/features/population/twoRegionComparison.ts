import type { AdminPopulationRegion } from './populationApi'

const AGE_BANDS = [
  { label: '0–19세', groups: ['0-9세', '10-19세'] },
  { label: '20–59세', groups: ['20-29세', '30-39세', '40-49세', '50-59세'] },
  { label: '60세 이상', groups: ['60-69세', '70-79세', '80-89세', '90-99세', '100세 이상'] },
] as const

export interface AgeBandShare {
  label: string
  percent: number
}

export function getAgeBandShares(region: AdminPopulationRegion): AgeBandShare[] | null {
  const byGroup = new Map(
    region.ageDistribution.map((item) => [item.ageGroup, item.population]),
  )
  const expectedGroups = AGE_BANDS.flatMap((band) => band.groups)
  if (expectedGroups.some((group) => !byGroup.has(group))) return null

  const total = expectedGroups.reduce((sum, group) => sum + (byGroup.get(group) ?? 0), 0)
  if (total <= 0) return null

  return AGE_BANDS.map((band) => ({
    label: band.label,
    percent: band.groups.reduce((sum, group) => sum + (byGroup.get(group) ?? 0), 0) / total * 100,
  }))
}

export function getComparedRegions(
  items: AdminPopulationRegion[],
  firstCode: string,
  secondCode: string | null,
): [AdminPopulationRegion | undefined, AdminPopulationRegion | undefined] {
  const byCode = new Map(items.map((item) => [item.regionCode, item]))
  return [
    byCode.get(firstCode),
    secondCode && secondCode !== firstCode ? byCode.get(secondCode) : undefined,
  ]
}
