import { describe, expect, it } from 'vitest'
import type { PopulationAvailabilityItem } from './populationApi'
import {
  selectComparisonBaseMonth,
  selectPopulationMonth,
  selectPopulationMonthInYear,
} from './availabilitySelection'

const months: PopulationAvailabilityItem[] = [
  { level: 'admin', statsYm: '202501', storedRegionCount: 19, expectedRegionCount: 19, complete: true },
  { level: 'admin', statsYm: '202502', storedRegionCount: 19, expectedRegionCount: 19, complete: true },
  { level: 'admin', statsYm: '202601', storedRegionCount: 19, expectedRegionCount: 19, complete: true },
  { level: 'admin', statsYm: '202602', storedRegionCount: 16, expectedRegionCount: 19, complete: false },
  { level: 'legal', statsYm: '202602', storedRegionCount: 41, expectedRegionCount: 41, complete: true },
]

describe('인구 조회 월 선택', () => {
  it('기본값은 현재 지역 구분에서 가장 최근의 완전한 월이다', () => {
    expect(selectPopulationMonth(months, 'admin', null)).toBe('202601')
    expect(selectPopulationMonth(months, 'legal', null)).toBe('202602')
  })

  it('사용자가 고른 불완전한 월은 유지한다', () => {
    expect(selectPopulationMonth(months, 'admin', '202602')).toBe('202602')
  })

  it('연도를 바꿀 때 같은 월이 불완전하면 해당 연도의 완전한 월을 고른다', () => {
    expect(selectPopulationMonthInYear(months, 'admin', 2026, 2)).toBe('202601')
  })

  it('비교 기준월은 완전한 과거 월을 우선하고 수동 선택은 유지한다', () => {
    expect(selectComparisonBaseMonth(months, 'admin', '202602', '')).toBe('202502')
    expect(selectComparisonBaseMonth(months, 'admin', '202601', '202602')).toBe('202602')
  })

  it('완전한 월이 없는 경우에는 저장된 월을 선택할 수 있다', () => {
    const partialOnly = months.filter((item) => item.statsYm === '202602' && item.level === 'admin')
    expect(selectPopulationMonth(partialOnly, 'admin', null)).toBe('202602')
  })
})
