import { describe, expect, it } from 'vitest'
import type { FacilityItem } from '../facilities/facilityApi'
import type { GeoJsonFeature } from './boundaryLoader'
import {
  countFacilitiesByCategory,
  featuresIntersect,
} from './spatialAnalysis'

function square(minX: number, minY: number, maxX: number, maxY: number): GeoJsonFeature {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ]],
    },
  }
}

describe('spatial analysis cache', () => {
  it('detects intersecting and separated polygons', () => {
    const target = square(0, 0, 10, 10)

    expect(featuresIntersect(target, square(9, 9, 12, 12))).toBe(true)
    expect(featuresIntersect(target, square(20, 20, 30, 30))).toBe(false)
  })

  it('counts facilities and reuses the cached result', () => {
    const target = square(0, 0, 10, 10)
    const facilities: FacilityItem[] = [
      {
        id: 1,
        sourceId: 'hospital-1',
        category: 'HOSPITAL',
        name: '테스트 병원',
        latitude: 5,
        longitude: 5,
        roadAddress: null,
        parcelAddress: null,
        phone: null,
        source: 'TEST',
        fetchedAt: null,
      },
      {
        id: 2,
        sourceId: 'school-1',
        category: 'SCHOOL',
        name: '범위 밖 학교',
        latitude: 20,
        longitude: 20,
        roadAddress: null,
        parcelAddress: null,
        phone: null,
        source: 'TEST',
        fetchedAt: null,
      },
    ]

    const first = countFacilitiesByCategory(facilities, target)
    const second = countFacilitiesByCategory(facilities, target)

    expect(first.get('HOSPITAL')).toBe(1)
    expect(first.get('SCHOOL')).toBeUndefined()
    expect(second).toBe(first)
  })
})
