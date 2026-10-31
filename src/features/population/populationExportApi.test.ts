import { describe, expect, it } from 'vitest'
import { populationExportParams } from './populationExportApi'

describe('populationExportParams', () => {
  const base = {
    level: 'admin' as const,
    regionCodes: ['4825025000', '4825026000'],
    statsYm: '202503',
    fromYm: '202501',
    toYm: '202503',
    fields: ['population', 'households'] as Array<'population' | 'households'>,
  }

  it('지역 기간과 선택 변수를 순서대로 보낸다', () => {
    const params = populationExportParams({ ...base, scope: 'region' })
    expect(params.getAll('region_codes')).toEqual(['4825025000', '4825026000'])
    expect(params.get('from_ym')).toBe('202501')
    expect(params.get('to_ym')).toBe('202503')
    expect(params.get('stats_ym')).toBeNull()
    expect(params.getAll('fields')).toEqual(['population', 'households'])
  })

  it('전체 지역은 현재 월만 보내고 지역 조건은 제외한다', () => {
    const params = populationExportParams({ ...base, scope: 'month' })
    expect(params.get('stats_ym')).toBe('202503')
    expect(params.get('region_codes')).toBeNull()
    expect(params.get('from_ym')).toBeNull()
  })
})
