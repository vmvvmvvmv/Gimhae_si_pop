import { describe, expect, it } from 'vitest'
import type { GeoJsonFeature } from '../boundaries/boundaryLoader'
import { getRegionTourBounds } from './regionTourBounds'

function region(name: string, coordinates: unknown, type = 'Polygon'): GeoJsonFeature {
  return { type: 'Feature', properties: { adm_nm: name }, geometry: { type, coordinates } }
}

describe('getRegionTourBounds', () => {
  const project = (x: number, y: number) => ({ x, y })
  const viewport = { width: 400, height: 300 }

  it('GeoJSON 꼭짓점에 맞춘 지역 하나의 화면 범위를 반환한다', () => {
    const result = getRegionTourBounds([
      region('김해시 부원동', [[[100, 80], [170, 80], [170, 140], [100, 140], [100, 80]]]),
    ], project, viewport)

    expect(result).toEqual({
      featureIndex: 0,
      name: '김해시 부원동',
      bounds: { left: 100, top: 80, right: 170, bottom: 140, width: 70, height: 60 },
      path: 'M0 0 L70 0 L70 60 L0 60 L0 0 Z',
    })
  })

  it('사각형 범위가 아닌 GeoJSON 외곽선과 내부 구멍을 각각 경로로 만든다', () => {
    const result = getRegionTourBounds([
      region('김해시 부원동', [
        [[100, 80], [170, 80], [145, 140], [100, 80]],
        [[125, 100], [135, 100], [130, 110], [125, 100]],
      ]),
    ], project, viewport)

    expect(result?.path).toBe('M0 0 L70 0 L45 60 L0 0 Z M25 20 L35 20 L30 30 L25 20 Z')
  })

  it('화면 안의 부원동을 우선하고 화면 밖 지역은 제외한다', () => {
    const result = getRegionTourBounds([
      region('화면 밖', [[[500, 40], [550, 40], [550, 90], [500, 90]]]),
      region('다른 동', [[[180, 100], [230, 100], [230, 150], [180, 150]]]),
      region('김해시 부원동', [[[[80, 80], [120, 80], [120, 120], [80, 120]]]], 'MultiPolygon'),
    ], project, viewport)

    expect(result?.name).toBe('김해시 부원동')
    expect(result?.featureIndex).toBe(2)
  })

  it('지도에 완전히 보이는 지역이 없으면 대상을 만들지 않는다', () => {
    expect(getRegionTourBounds([
      region('화면 밖', [[[500, 40], [550, 40], [550, 90], [500, 90]]]),
    ], project, viewport)).toBeNull()
  })
})
