import type {
  GeoJsonFeature,
} from '../boundaries/boundaryLoader'
import type { DevelopmentNotice } from './developmentApi'

type Position = [number, number]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeAreaName(value: string): string {
  return value
    .replace(/김해/g, '')
    .replace(/(일반|국가|도시첨단)?산업단지/g, '')
    .replace(/농공단지|물류단지/g, '')
    .replace(/제[12]종지구단위계획구역|지구단위계획구역/g, '')
    .replace(/주거개발진흥지구|산업개발진흥지구|개발진흥지구/g, '')
    .replace(/공공\s*개발사업/g, '')
    .replace(/도시개발(구역|사업)|택지개발사업/g, '')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .trim()
}

function getNameMatches(
  areaName: string,
  areaCategory: string,
  notices: DevelopmentNotice[],
): DevelopmentNotice[] {
  const normalizedName = normalizeAreaName(areaName)

  if (areaCategory === 'INDUSTRIAL_COMPLEX' && normalizedName.length >= 2) {
    const industrialNamePattern = new RegExp(
      `${escapeRegExp(normalizedName)}(?:일반|국가|도시첨단)?(?:산업단지|농공단지|물류단지)`,
    )
    return notices.filter((notice) => {
      const noticeText = `${notice.title} ${notice.summary ?? ''}`
        .replace(/[^0-9A-Za-z가-힣]/g, '')
      return industrialNamePattern.test(noticeText)
    })
  }

  if (
    normalizedName.length < 4 &&
    !(normalizedName.length >= 3 && /\d$/.test(normalizedName))
  ) {
    return []
  }

  return notices.filter((notice) => {
    const noticeText = `${notice.title} ${notice.summary ?? ''}`
      .replace(/[^0-9A-Za-z가-힣]/g, '')
    return noticeText.includes(normalizedName)
  })
}

export function getDevelopmentNoticeMatches(
  areaName: string,
  areaCategory: string,
  notices: DevelopmentNotice[],
  noticeSourceId = '',
): DevelopmentNotice[] {
  const exactMatches = noticeSourceId
    ? notices.filter((notice) => notice.sourceId === noticeSourceId)
    : []
  const nameMatches = getNameMatches(areaName, areaCategory, notices)
  const uniqueMatches = new Map<number, DevelopmentNotice>()

  for (const notice of [...exactMatches, ...nameMatches]) {
    uniqueMatches.set(notice.id, notice)
  }

  return Array.from(uniqueMatches.values()).sort((left, right) =>
    right.noticeDate.localeCompare(left.noticeDate),
  )
}

export function getDevelopmentAreaNotices(
  feature: GeoJsonFeature,
  notices: DevelopmentNotice[],
): DevelopmentNotice[] {
  const properties = feature.properties
  return getDevelopmentNoticeMatches(
    String(properties.name ?? properties.categoryLabel ?? '개발 관련 구역'),
    String(properties.category ?? ''),
    notices,
    String(properties.noticeSourceId ?? ''),
  )
}

export function getDevelopmentAreaNoticeYear(
  feature: GeoJsonFeature,
  notices: DevelopmentNotice[],
): number | null {
  return getDevelopmentAreaMetadata(feature, notices).noticeYear
}

export function isDevelopmentAreaEnded(
  feature: GeoJsonFeature,
  notices: DevelopmentNotice[],
): boolean {
  return getDevelopmentAreaMetadata(feature, notices).isEnded
}

export function getDevelopmentAreaMetadata(
  feature: GeoJsonFeature,
  notices: DevelopmentNotice[],
): {
  noticeYear: number | null
  isEnded: boolean
  noticeCount: number
} {
  const matches = getDevelopmentAreaNotices(feature, notices)
  const latestNotice = matches[0]
  const sourceId = String(feature.properties.noticeSourceId ?? '')
  const matchedYear = sourceId.match(/NTC(\d{4})/)?.[1]
  return {
    noticeYear: latestNotice
      ? Number(latestNotice.noticeDate.slice(0, 4))
      : matchedYear
        ? Number(matchedYear)
        : null,
    isEnded:
      latestNotice !== undefined && isTerminalDevelopmentNotice(latestNotice),
    noticeCount: matches.length,
  }
}

function isTerminalDevelopmentNotice(notice: DevelopmentNotice): boolean {
  const title = notice.title.replace(/[^0-9A-Za-z가-힣]/g, '')
  const designationEnded = [
    /(?:산업단지|농공단지|물류단지)지정해제/,
    /도시개발구역(?:지정)?해제/,
    /택지개발사업.*(?:지정해제|승인취소|사업취소)/,
    /공급촉진지구지정해제/,
  ].some((pattern) => pattern.test(title))
  const projectCompleted =
    /(?:도시개발사업|택지개발사업|산업단지|농공단지|물류단지).*(?:준공|사업완료)/.test(
      title,
    )

  return designationEnded || projectCompleted
}

function asPosition(value: unknown): Position | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number'
  ) {
    return null
  }
  return [value[0], value[1]]
}

function asRing(value: unknown): Position[] | null {
  if (!Array.isArray(value)) return null
  const ring = value.map(asPosition)
  return ring.every((position) => position !== null)
    ? (ring as Position[])
    : null
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentX, currentY] = ring[current]
    const [previousX, previousY] = ring[previous]
    const crosses =
      currentY > point[1] !== previousY > point[1] &&
      point[0] <
        ((previousX - currentX) * (point[1] - currentY)) /
          (previousY - currentY) +
          currentX
    if (crosses) inside = !inside
  }
  return inside
}

function pointInPolygon(point: Position, value: unknown): boolean {
  if (!Array.isArray(value) || !value.length) return false
  const rings = value.map(asRing)
  const outerRing = rings[0]
  if (!outerRing || !pointInRing(point, outerRing)) return false
  return !rings.slice(1).some((ring) => ring && pointInRing(point, ring))
}

export function developmentFeatureContainsPoint(
  feature: GeoJsonFeature,
  point: Position,
): boolean {
  const { type, coordinates } = feature.geometry
  if (type === 'Polygon') return pointInPolygon(point, coordinates)
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates.some((polygon) => pointInPolygon(point, polygon))
  }
  return false
}

function ringArea(ring: Position[]): number {
  let area = 0
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    area +=
      ring[previous][0] * ring[current][1] -
      ring[current][0] * ring[previous][1]
  }
  return Math.abs(area / 2)
}

function polygonArea(value: unknown): number {
  if (!Array.isArray(value) || !value.length) return 0
  const rings = value.map(asRing)
  const outerArea = rings[0] ? ringArea(rings[0]) : 0
  const holeArea = rings
    .slice(1)
    .reduce((sum, ring) => sum + (ring ? ringArea(ring) : 0), 0)
  return Math.max(outerArea - holeArea, 0)
}

export function getDevelopmentFeatureArea(feature: GeoJsonFeature): number {
  const { type, coordinates } = feature.geometry
  if (type === 'Polygon') return polygonArea(coordinates)
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0)
  }
  return 0
}
