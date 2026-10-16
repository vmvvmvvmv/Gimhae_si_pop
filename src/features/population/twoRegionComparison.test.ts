import { describe, expect, it } from 'vitest'
import type { AdminPopulationRegion } from './populationApi'
import { getAgeBandShares, getComparedRegions } from './twoRegionComparison'

const ageGroups = [
  '0-9세', '10-19세', '20-29세', '30-39세', '40-49세', '50-59세',
  '60-69세', '70-79세', '80-89세', '90-99세', '100세 이상',
]

function region(code: string, ageCounts: number[] = Array(11).fill(10)): AdminPopulationRegion {
  return {
    regionCode: code,
    regionName: `지역 ${code}`,
    population: 110,
    households: 50,
    populationPerHousehold: 2.2,
    malePopulation: 55,
    femalePopulation: 55,
    areaKm2: 1,
    populationDensity: 110,
    comparisons: {
      previousMonth: { statsYm: '202412', population: 100, change: 10, changeRate: 10 },
      previousYear: { statsYm: '202401', population: 90, change: 20, changeRate: 22.22 },
    },
    sourceRowCount: 1,
    ageDistribution: ageCounts.map((population, index) => ({
      ageGroup: ageGroups[index],
      population,
      malePopulation: 0,
      femalePopulation: 0,
    })),
    ageSourceRowCount: ageCounts.length,
  }
}

describe('두 동 같은 월 비교', () => {
  it('현재 조회월 목록에서만 두 지역을 찾고 같은 동 중복 선택을 막는다', () => {
    const items = [region('A'), region('B')]
    expect(getComparedRegions(items, 'A', 'B').map((item) => item?.regionCode))
      .toEqual(['A', 'B'])
    expect(getComparedRegions(items, 'A', 'A')[1]).toBeUndefined()
    expect(getComparedRegions(items, 'A', 'missing')[1]).toBeUndefined()
  })

  it('완전한 11개 연령대만 세 구간의 비율로 계산한다', () => {
    const shares = getAgeBandShares(region('A'))
    expect(shares?.map((item) => item.label)).toEqual(['0–19세', '20–59세', '60세 이상'])
    expect(shares?.map((item) => item.percent.toFixed(1)))
      .toEqual(['18.2', '36.4', '45.5'])
  })

  it('연령대가 일부 없거나 합계가 0이면 비율을 보여주지 않는다', () => {
    expect(getAgeBandShares(region('A', Array(10).fill(10)))).toBeNull()
    expect(getAgeBandShares(region('A', Array(11).fill(0)))).toBeNull()
  })
})
