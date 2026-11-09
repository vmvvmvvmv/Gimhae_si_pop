export const POPULATION_FILL_COLORS = [
  '#c8dcf2',
  '#8db4dd',
  '#578bc2',
  '#2f66a9',
  '#174a8c',
] as const

export type MapControlPopover = 'development' | 'facility'

interface BoundaryStyleOptions {
  population?: number
  maximumPopulation: number
  showDevelopmentAreas: boolean
  isSelected: boolean
  isCompared?: boolean
}

export function getBoundaryVisualStyle({
  population,
  maximumPopulation,
  showDevelopmentAreas,
  isSelected,
  isCompared = false,
}: BoundaryStyleOptions): Record<string, unknown> {
  const ratio = population ? population / Math.max(maximumPopulation, 1) : 0
  const colorIndex = population
    ? Math.min(
        POPULATION_FILL_COLORS.length - 1,
        Math.floor(ratio * POPULATION_FILL_COLORS.length),
      )
    : 0

  return {
    fillColor: POPULATION_FILL_COLORS[colorIndex],
    fillOpacity: showDevelopmentAreas
      ? (population ? 0.7 : 0.36)
      : (population ? 0.86 : 0.45),
    strokeColor: isSelected ? '#f7c948' : isCompared ? '#19a79e' : '#174a8c',
    strokeOpacity: 1,
    strokeWeight: isSelected ? 5 : isCompared ? 4 : 1.4,
    clickable: true,
    zIndex: isSelected ? 55 : isCompared ? 54 : 10,
  }
}

export function toggleMapControlPopover(
  current: MapControlPopover | null,
  target: MapControlPopover,
): MapControlPopover | null {
  return current === target ? null : target
}

// 김해시 경계 범위입니다. 지도 중심이 이 안에 있으면 김해가 항상 화면에 남습니다.
const GIMHAE_CENTER_LIMITS = { south: 35.15, north: 35.4, west: 128.69, east: 129.02 }

export function clampMapCenter(longitude: number, latitude: number): [number, number] {
  const { south, north, west, east } = GIMHAE_CENTER_LIMITS
  return [
    Math.min(Math.max(longitude, west), east),
    Math.min(Math.max(latitude, south), north),
  ]
}

export function shouldShowMapHoverPreview(
  developmentInfoPinned: boolean,
): boolean {
  return !developmentInfoPinned
}
