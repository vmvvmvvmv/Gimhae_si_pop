export interface TourRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface TourViewport {
  width: number
  height: number
}

export interface TourPoint {
  left: number
  top: number
}

const EDGE_GAP = 12
const TARGET_GAP = 14

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

export function getSpotlightRect(
  target: TourRect,
  viewport: TourViewport,
  limits: { maxWidth?: number; maxHeight?: number } = {},
): TourRect | null {
  const visibleLeft = clamp(target.left, 0, viewport.width)
  const visibleTop = clamp(target.top, 0, viewport.height)
  const visibleRight = clamp(target.right, 0, viewport.width)
  const visibleBottom = clamp(target.bottom, 0, viewport.height)
  const visibleWidth = visibleRight - visibleLeft
  const visibleHeight = visibleBottom - visibleTop
  if (visibleWidth <= 0 || visibleHeight <= 0) return null

  const width = Math.min(visibleWidth, limits.maxWidth ?? visibleWidth)
  const height = Math.min(visibleHeight, limits.maxHeight ?? visibleHeight)
  const focusLeft = visibleLeft + (visibleWidth - width) / 2
  // 큰 지도·패널은 위쪽 일부를 강조해 모바일에서도 설명 카드를 아래에 둘 수 있게 합니다.
  const focusTop = visibleTop + Math.min(12, visibleHeight - height)
  const left = clamp(focusLeft - 6, 0, viewport.width)
  const top = clamp(focusTop - 6, 0, viewport.height)
  const right = clamp(focusLeft + width + 6, 0, viewport.width)
  const bottom = clamp(focusTop + height + 6, 0, viewport.height)

  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function getGuideCardPosition(
  spotlight: TourRect | null,
  viewport: TourViewport,
  card: { width: number; height: number },
): TourPoint {
  const centeredLeft = clamp((viewport.width - card.width) / 2, EDGE_GAP, viewport.width - card.width - EDGE_GAP)
  const centeredTop = clamp((viewport.height - card.height) / 2, EDGE_GAP, viewport.height - card.height - EDGE_GAP)
  if (!spotlight) return { left: centeredLeft, top: centeredTop }

  const besideTop = clamp(
    spotlight.top + (spotlight.height - card.height) / 2,
    EDGE_GAP,
    viewport.height - card.height - EDGE_GAP,
  )
  if (viewport.width - spotlight.right >= card.width + TARGET_GAP + EDGE_GAP) {
    return { left: spotlight.right + TARGET_GAP, top: besideTop }
  }
  if (spotlight.left >= card.width + TARGET_GAP + EDGE_GAP) {
    return { left: spotlight.left - card.width - TARGET_GAP, top: besideTop }
  }

  const belowLeft = clamp(
    spotlight.left + (spotlight.width - card.width) / 2,
    EDGE_GAP,
    viewport.width - card.width - EDGE_GAP,
  )
  if (viewport.height - spotlight.bottom >= card.height + TARGET_GAP + EDGE_GAP) {
    return { left: belowLeft, top: spotlight.bottom + TARGET_GAP }
  }
  if (spotlight.top >= card.height + TARGET_GAP + EDGE_GAP) {
    return { left: belowLeft, top: spotlight.top - card.height - TARGET_GAP }
  }

  // 작은 화면에서는 카드가 강조 영역을 조금 가릴 수 있지만 화면 밖으로 나가지는 않습니다.
  return {
    left: centeredLeft,
    top: clamp(viewport.height - card.height - EDGE_GAP, EDGE_GAP, viewport.height - card.height - EDGE_GAP),
  }
}
