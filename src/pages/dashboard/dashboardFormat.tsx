import type { GeoJsonFeature } from '../../features/boundaries/boundaryLoader'

export function formatChange(change: number | null, changeRate: number | null) {
  if (change === null || changeRate === null) {
    return <span className="population-change unavailable">비교 데이터 없음</span>
  }

  const sign = change > 0 ? '+' : ''
  const direction = change > 0
    ? 'increase'
    : change < 0
      ? 'decrease'
      : 'steady'
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '―'
  return (
    <span className={`population-change ${direction}`}>
      <span className="population-change-arrow" aria-hidden="true">
        {arrow}
      </span>
      {sign}{change.toLocaleString()}명 ({sign}{changeRate.toFixed(2)}%)
    </span>
  )
}

export function formatLegendPopulation(value: number): string {
  if (value >= 10_000) {
    const tenThousands = value / 10_000
    return `${tenThousands >= 10 ? Math.round(tenThousands) : tenThousands.toFixed(1)}만`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}천`
  }
  return value.toLocaleString()
}

export function normalizeSearchText(value: string): string {
  return value
    .replace(/경상남도|김해시/g, '')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .toLocaleLowerCase('ko-KR')
}

export function getSearchScore(value: string, query: string): number {
  const normalizedValue = normalizeSearchText(value)
  if (normalizedValue === query) return 0
  if (normalizedValue.startsWith(query)) return 1
  return normalizedValue.includes(query) ? 2 : Number.POSITIVE_INFINITY
}

export function getFeatureCenter(feature: GeoJsonFeature): {
  latitude: number
  longitude: number
} | null {
  let minimumLongitude = Number.POSITIVE_INFINITY
  let maximumLongitude = Number.NEGATIVE_INFINITY
  let minimumLatitude = Number.POSITIVE_INFINITY
  let maximumLatitude = Number.NEGATIVE_INFINITY

  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      minimumLongitude = Math.min(minimumLongitude, value[0])
      maximumLongitude = Math.max(maximumLongitude, value[0])
      minimumLatitude = Math.min(minimumLatitude, value[1])
      maximumLatitude = Math.max(maximumLatitude, value[1])
      return
    }
    value.forEach(visit)
  }

  visit(feature.geometry.coordinates)
  if (
    !Number.isFinite(minimumLongitude) ||
    !Number.isFinite(maximumLongitude) ||
    !Number.isFinite(minimumLatitude) ||
    !Number.isFinite(maximumLatitude)
  ) {
    return null
  }
  return {
    latitude: (minimumLatitude + maximumLatitude) / 2,
    longitude: (minimumLongitude + maximumLongitude) / 2,
  }
}
