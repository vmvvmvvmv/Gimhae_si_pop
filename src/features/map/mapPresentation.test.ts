import { describe, expect, it } from 'vitest'
import {
  clampMapCenter,
  getBoundaryVisualStyle,
  shouldShowMapHoverPreview,
  toggleMapControlPopover,
} from './mapPresentation'

describe('지도 중심 제한', () => {
  it('김해 안의 중심은 그대로 둔다', () => {
    expect(clampMapCenter(128.889, 35.228)).toEqual([128.889, 35.228])
  })

  it('김해 밖의 중심은 가장 가까운 경계로 되돌린다', () => {
    expect(clampMapCenter(127.0, 37.5)).toEqual([128.69, 35.4])
    expect(clampMapCenter(130.0, 34.0)).toEqual([129.02, 35.15])
  })
})

describe('지도 표시 상태', () => {
  it('선택 지역은 일반 지역보다 굵고 높은 경계로 유지한다', () => {
    const style = getBoundaryVisualStyle({
      population: 20_000,
      maximumPopulation: 40_000,
      showDevelopmentAreas: false,
      isSelected: true,
    })

    expect(style).toMatchObject({
      strokeColor: '#f7c948',
      strokeWeight: 5,
      zIndex: 55,
    })
  })

  it('개발구역을 켜도 인구 면의 가독성을 유지한다', () => {
    const normal = getBoundaryVisualStyle({
      population: 20_000,
      maximumPopulation: 40_000,
      showDevelopmentAreas: false,
      isSelected: false,
    })
    const overlapped = getBoundaryVisualStyle({
      population: 20_000,
      maximumPopulation: 40_000,
      showDevelopmentAreas: true,
      isSelected: false,
    })

    expect(overlapped.fillOpacity).toBe(0.7)
    expect(Number(overlapped.fillOpacity)).toBeLessThan(
      Number(normal.fillOpacity),
    )
  })

  it('인구 값이 없으면 모든 지역을 같은 연한 색으로 칠한다', () => {
    const style = getBoundaryVisualStyle({
      maximumPopulation: 0,
      showDevelopmentAreas: false,
      isSelected: false,
    })
    expect(style).toMatchObject({ fillColor: '#c8dcf2', fillOpacity: 0.45 })
  })

  it('두 동 비교에서는 두 번째 동을 다른 경계색으로 표시한다', () => {
    const style = getBoundaryVisualStyle({
      population: 20_000,
      maximumPopulation: 40_000,
      showDevelopmentAreas: false,
      isSelected: false,
      isCompared: true,
    })
    expect(style).toMatchObject({
      strokeColor: '#19a79e',
      strokeWeight: 4,
      zIndex: 54,
    })
  })

})

describe('지도 팝업 상태', () => {
  it('다른 필터를 열면 기존 필터 대신 새 필터만 연다', () => {
    expect(toggleMapControlPopover('development', 'facility')).toBe('facility')
    expect(toggleMapControlPopover('facility', 'development')).toBe('development')
  })

  it('열린 필터 버튼을 다시 누르면 닫는다', () => {
    expect(toggleMapControlPopover('facility', 'facility')).toBeNull()
  })

  it('고시정보가 고정된 동안 마우스 미리보기로 덮지 않는다', () => {
    expect(shouldShowMapHoverPreview(true)).toBe(false)
    expect(shouldShowMapHoverPreview(false)).toBe(true)
  })
})
