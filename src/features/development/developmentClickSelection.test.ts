import { describe, expect, it } from 'vitest'
import type { GeoJsonCollection, GeoJsonFeature } from '../boundaries/boundaryLoader'
import { getClickedDevelopmentFeatures } from './developmentMatching'

function square(id: string, radius: number): GeoJsonFeature {
  return {
    type: 'Feature',
    properties: { areaSourceId: id },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-radius, -radius], [radius, -radius],
        [radius, radius], [-radius, radius], [-radius, -radius],
      ]],
    },
  }
}

function collection(...features: GeoJsonFeature[]): GeoJsonCollection {
  return { type: 'FeatureCollection', features }
}

function ids(features: GeoJsonFeature[]): string[] {
  return features.map((feature) => String(feature.properties.areaSourceId))
}

describe('겹친 개발구역 지도 클릭', () => {
  it('겹친 구역을 작은 면적부터 선택한다', () => {
    const areas = collection(square('large', 3), square('small', 1))
    expect(ids(getClickedDevelopmentFeatures(areas, [0, 0], 'large')))
      .toEqual(['small', 'large'])
  })

  it('면적이 같으면 GeoJSON 원래 순서를 유지한다', () => {
    const areas = collection(square('second', 2), square('first', 2))
    expect(ids(getClickedDevelopmentFeatures(areas, [0, 0], 'first')))
      .toEqual(['second', 'first'])
  })

  it('숨긴 구역은 겹침 목록과 클릭 대상에서 제외한다', () => {
    const areas = collection(square('large', 3), square('small', 1))
    const visible = new Set(['large'])
    expect(ids(getClickedDevelopmentFeatures(areas, [0, 0], 'large', visible)))
      .toEqual(['large'])
    expect(getClickedDevelopmentFeatures(areas, [0, 0], 'small', visible))
      .toEqual([])
  })

  it('다각형 구멍 안의 다른 구역만 선택한다', () => {
    const donut: GeoJsonFeature = {
      ...square('donut', 3),
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[-3, -3], [3, -3], [3, 3], [-3, 3], [-3, -3]],
          [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]],
        ],
      },
    }
    const areas = collection(donut, square('inside-hole', 0.5))
    expect(ids(getClickedDevelopmentFeatures(areas, [0, 0], 'inside-hole')))
      .toEqual(['inside-hole'])
  })

  it('좌표를 읽지 못하거나 경계 포함 판정이 어긋나도 클릭한 구역은 유지한다', () => {
    const areas = collection(square('clicked', 2), square('other', 1))
    expect(ids(getClickedDevelopmentFeatures(areas, null, 'clicked')))
      .toEqual(['clicked'])
    expect(ids(getClickedDevelopmentFeatures(areas, [4, 4], 'clicked')))
      .toEqual(['clicked'])
  })
})
