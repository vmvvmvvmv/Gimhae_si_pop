import type { GeoJsonFeature } from './boundaryLoader'
import type {
  FacilityCategory,
  FacilityItem,
} from '../facilities/facilityApi'

type Position = [number, number]
type Ring = Position[]
type Polygon = Ring[]
type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const ringBoundsCache = new WeakMap<Ring, Bounds>()
const intersectionCache = new WeakMap<
  GeoJsonFeature,
  WeakMap<GeoJsonFeature, boolean>
>()
const facilityCountCache = new WeakMap<
  FacilityItem[],
  WeakMap<GeoJsonFeature, Map<FacilityCategory, number>>
>()

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

function asPolygons(feature: GeoJsonFeature): Polygon[] {
  const coordinates = feature.geometry.coordinates
  if (!Array.isArray(coordinates)) return []

  if (feature.geometry.type === 'Polygon') {
    return [coordinates as Polygon]
  }
  if (feature.geometry.type === 'MultiPolygon') {
    return coordinates as Polygon[]
  }
  return []
}

function pointInRing(point: Position, ring: Ring): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const start = ring[current]
    const end = ring[previous]
    if (!isPosition(start) || !isPosition(end)) continue

    const crosses =
      start[1] > point[1] !== end[1] > point[1] &&
      point[0] <
        ((end[0] - start[0]) * (point[1] - start[1])) /
          (end[1] - start[1]) +
          start[0]
    if (crosses) inside = !inside
  }
  return inside
}

export function pointInFeature(
  longitude: number,
  latitude: number,
  feature: GeoJsonFeature,
): boolean {
  const point: Position = [longitude, latitude]
  return asPolygons(feature).some((polygon) => {
    const [outer, ...holes] = polygon
    return (
      Array.isArray(outer) &&
      pointInRing(point, outer) &&
      !holes.some((hole) => pointInRing(point, hole))
    )
  })
}

function ringBounds(ring: Ring): Bounds {
  const cached = ringBoundsCache.get(ring)
  if (cached) return cached

  const positions = ring.filter(isPosition)
  const bounds = positions.reduce(
    (bounds, [longitude, latitude]) => ({
      minX: Math.min(bounds.minX, longitude),
      minY: Math.min(bounds.minY, latitude),
      maxX: Math.max(bounds.maxX, longitude),
      maxY: Math.max(bounds.maxY, latitude),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )
  ringBoundsCache.set(ring, bounds)
  return bounds
}

function boundsOverlap(
  left: ReturnType<typeof ringBounds>,
  right: ReturnType<typeof ringBounds>,
) {
  return !(
    left.maxX < right.minX ||
    right.maxX < left.minX ||
    left.maxY < right.minY ||
    right.maxY < left.minY
  )
}

function orientation(a: Position, b: Position, c: Position) {
  return (b[1] - a[1]) * (c[0] - b[0]) -
    (b[0] - a[0]) * (c[1] - b[1])
}

function segmentsIntersect(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
) {
  const first = orientation(a, b, c)
  const second = orientation(a, b, d)
  const third = orientation(c, d, a)
  const fourth = orientation(c, d, b)
  return first * second < 0 && third * fourth < 0
}

function ringsIntersect(left: Ring, right: Ring) {
  if (!boundsOverlap(ringBounds(left), ringBounds(right))) return false
  if (left[0] && pointInRing(left[0], right)) return true
  if (right[0] && pointInRing(right[0], left)) return true

  for (let leftIndex = 1; leftIndex < left.length; leftIndex += 1) {
    const leftStart = left[leftIndex - 1]
    const leftEnd = left[leftIndex]
    if (!isPosition(leftStart) || !isPosition(leftEnd)) continue

    for (let rightIndex = 1; rightIndex < right.length; rightIndex += 1) {
      const rightStart = right[rightIndex - 1]
      const rightEnd = right[rightIndex]
      if (
        isPosition(rightStart) &&
        isPosition(rightEnd) &&
        segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)
      ) {
        return true
      }
    }
  }
  return false
}

export function featuresIntersect(
  left: GeoJsonFeature,
  right: GeoJsonFeature,
): boolean {
  let rightCache = intersectionCache.get(left)
  if (!rightCache) {
    rightCache = new WeakMap<GeoJsonFeature, boolean>()
    intersectionCache.set(left, rightCache)
  }
  const cached = rightCache.get(right)
  if (cached !== undefined) return cached

  const intersects = asPolygons(left).some((leftPolygon) =>
    asPolygons(right).some((rightPolygon) =>
      Boolean(
        leftPolygon[0] &&
        rightPolygon[0] &&
        ringsIntersect(leftPolygon[0], rightPolygon[0]),
      ),
    ),
  )
  rightCache.set(right, intersects)
  return intersects
}

export function countFacilitiesByCategory(
  facilities: FacilityItem[],
  feature?: GeoJsonFeature,
): Map<FacilityCategory, number> {
  if (!feature) return new Map<FacilityCategory, number>()

  let featureCache = facilityCountCache.get(facilities)
  if (!featureCache) {
    featureCache = new WeakMap<
      GeoJsonFeature,
      Map<FacilityCategory, number>
    >()
    facilityCountCache.set(facilities, featureCache)
  }
  const cached = featureCache.get(feature)
  if (cached) return cached

  const counts = new Map<FacilityCategory, number>()

  for (const facility of facilities) {
    if (!pointInFeature(facility.longitude, facility.latitude, feature)) {
      continue
    }
    counts.set(facility.category, (counts.get(facility.category) ?? 0) + 1)
  }
  featureCache.set(feature, counts)
  return counts
}
