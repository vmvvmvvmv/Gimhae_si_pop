import { describe, expect, it } from 'vitest'
import type { FacilityItem } from '../../features/facilities/facilityApi'
import { buildSiteSearchResults } from './siteSearch'

const sources = {
  administrativeFeatures: [],
  legalFeatures: [],
  developmentFeatures: [],
  notices: [],
}

function facility(id: number, name: string): FacilityItem {
  return { id, name, category: 'HOSPITAL', roadAddress: null, parcelAddress: null } as unknown as FacilityItem
}

describe('buildSiteSearchResults', () => {
  it('검색어가 없으면 결과가 없다', () => {
    expect(buildSiteSearchResults({ ...sources, searchTerm: '  ', facilities: [facility(1, '김해병원')] })).toEqual([])
  })

  it('시설은 이름으로 찾고 분류 이름을 보여 주며 최대 4개까지만 돌려준다', () => {
    const facilities = [1, 2, 3, 4, 5].map((id) => facility(id, `김해병원${id}`))
    const results = buildSiteSearchResults({ ...sources, searchTerm: '김해병원', facilities })
    expect(results).toHaveLength(4)
    expect(results[0]).toMatchObject({ type: 'facility', subtitle: '주요 의료' })
  })
})
