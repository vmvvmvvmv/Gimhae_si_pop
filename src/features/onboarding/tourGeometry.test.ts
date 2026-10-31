import { describe, expect, it } from 'vitest'
import { getGuideCardPosition, getSpotlightRect, type TourRect } from './tourGeometry'

const target: TourRect = { left: 70, top: 20, right: 500, bottom: 250, width: 430, height: 230 }

describe('인앱 튜토리얼 강조 영역', () => {
  it('화면 안의 대상 주위를 강조한다', () => {
    expect(getSpotlightRect(target, { width: 1280, height: 720 })).toEqual({
      left: 64, top: 14, right: 506, bottom: 256, width: 442, height: 242,
    })
  })

  it('큰 지도는 일부만 강조하고 화면 밖 대상은 건너뛴다', () => {
    const map = getSpotlightRect(
      { left: 0, top: 80, right: 390, bottom: 900, width: 390, height: 820 },
      { width: 390, height: 720 },
      { maxHeight: 220 },
    )
    expect(map?.bottom).toBeLessThan(330)
    expect(getSpotlightRect(
      { left: 0, top: 800, right: 390, bottom: 1000, width: 390, height: 200 },
      { width: 390, height: 720 },
    )).toBeNull()
  })
})

describe('인앱 튜토리얼 설명 카드 위치', () => {
  it('데스크톱에서는 대상 오른쪽의 빈 곳에 놓는다', () => {
    expect(getGuideCardPosition(target, { width: 1280, height: 720 }, { width: 340, height: 280 }).left)
      .toBeGreaterThan(target.right)
  })

  it('모바일에서는 대상 아래 공간을 사용한다', () => {
    const spotlight: TourRect = { left: 6, top: 70, right: 384, bottom: 280, width: 378, height: 210 }
    const card = getGuideCardPosition(spotlight, { width: 390, height: 720 }, { width: 350, height: 280 })
    expect(card.top).toBeGreaterThan(spotlight.bottom)
    expect(card.left).toBeGreaterThanOrEqual(12)
  })
})
