import type { GeoJsonFeature } from '../boundaries/boundaryLoader'
import type { TourRect, TourViewport } from './tourGeometry'

interface ProjectedPoint {
  x: number
  y: number
}

export interface RegionTourBounds {
  featureIndex: number
  name: string
  bounds: TourRect
  path: string
}

function visitRings(value: unknown, visit: (ring: unknown[]) => void): void {
  if (!Array.isArray(value)) return
  if (Array.isArray(value[0]) && typeof value[0][0] === 'number' && typeof value[0][1] === 'number') {
    visit(value)
    return
  }
  value.forEach((child) => visitRings(child, visit))
}

function pathCoordinate(value: number): number {
  return Math.round(value * 10) / 10
}

// GeoJSON의 모든 꼭짓점을 지도 화면의 픽셀로 바꿔 지역 하나의 실제 화면 크기를 구합니다.
export function getRegionTourBounds(
  features: GeoJsonFeature[],
  project: (longitude: number, latitude: number) => ProjectedPoint | null,
  viewport: TourViewport,
  preferredName = '부원동',
): RegionTourBounds | null {
  let best: (RegionTourBounds & { score: number }) | null = null

  for (const [featureIndex, feature] of features.entries()) {
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue

    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    const projectedRings: ProjectedPoint[][] = []
    visitRings(feature.geometry.coordinates, (ring) => {
      const points: ProjectedPoint[] = []
      for (const coordinate of ring) {
        if (!Array.isArray(coordinate) ||
            typeof coordinate[0] !== 'number' || typeof coordinate[1] !== 'number') continue
        const point = project(coordinate[0], coordinate[1])
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
        points.push(point)
        left = Math.min(left, point.x)
        top = Math.min(top, point.y)
        right = Math.max(right, point.x)
        bottom = Math.max(bottom, point.y)
      }
      if (points.length >= 3) projectedRings.push(points)
    })

    const width = right - left
    const height = bottom - top
    // 화면 밖에 있거나 너무 큰 지역은 사용자가 직접 눌러 보기 어렵습니다.
    if (
      left < 12 || top < 12 || right > viewport.width - 12 || bottom > viewport.height - 12 ||
      projectedRings.length === 0 || width < 24 || height < 24 ||
      width > viewport.width * 0.55 || height > viewport.height * 0.55
    ) continue

    const name = String(feature.properties.adm_nm ?? feature.properties.EMD_NM ?? '지역')
    const centerX = (left + right) / 2
    const centerY = (top + bottom) / 2
    const distance = ((centerX - viewport.width / 2) / viewport.width) ** 2 +
      ((centerY - viewport.height / 2) / viewport.height) ** 2
    const score = distance + (name.endsWith(preferredName) ? -1 : 0)
    if (best && best.score <= score) continue

    best = {
      featureIndex,
      name,
      bounds: { left, top, right, bottom, width, height },
      // 각 링을 실제 지도 픽셀로 그립니다. 짝수-홀수 채우기로 GeoJSON의 구멍도 유지합니다.
      path: projectedRings.map((points) =>
        `${points.map((point, index) =>
          `${index === 0 ? 'M' : 'L'}${pathCoordinate(point.x - left)} ${pathCoordinate(point.y - top)}`,
        ).join(' ')} Z`,
      ).join(' '),
      score,
    }
  }

  return best ? { featureIndex: best.featureIndex, name: best.name, bounds: best.bounds, path: best.path } : null
}
