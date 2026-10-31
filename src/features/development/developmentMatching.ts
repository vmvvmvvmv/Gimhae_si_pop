import type { GeoJsonCollection, GeoJsonFeature } from '../boundaries/boundaryLoader'
import type { DevelopmentNotice } from './developmentApi'

export interface DevelopmentAreaSelection {
  sourceId: string
  name: string
  category: string
  categoryLabel: string
  stageLabel: string
  notices: DevelopmentNotice[]
  imageUrl?: string
  imageSourceUrl?: string
  imageSourceName?: string
}

type Position = [number, number]

interface IndexedDevelopmentNotices {
  entries: Array<{
    notice: DevelopmentNotice
    normalizedTitle: string
  }>
  bySourceId: Map<string, DevelopmentNotice[]>
}

const noticeIndexCache = new WeakMap<
  DevelopmentNotice[],
  IndexedDevelopmentNotices
>()
const areaNoticeCache = new WeakMap<
  DevelopmentNotice[],
  WeakMap<GeoJsonFeature, DevelopmentNotice[]>
>()

// 위 WeakMap은 고시 목록과 도형 객체가 그대로인 동안 계산 결과를 재사용합니다.
// 필터를 바꿀 때 수천 건의 고시 제목을 매번 정리하지 않으려는 캐시입니다.
function getNoticeIndex(
  notices: DevelopmentNotice[],
): IndexedDevelopmentNotices {
  const cached = noticeIndexCache.get(notices)
  if (cached) return cached

  const bySourceId = new Map<string, DevelopmentNotice[]>()
  const entries = notices.map((notice) => {
    if (notice.sourceId) {
      const sourceMatches = bySourceId.get(notice.sourceId) ?? []
      sourceMatches.push(notice)
      bySourceId.set(notice.sourceId, sourceMatches)
    }
    return {
      notice,
      normalizedTitle: notice.title.replace(
        /[^0-9A-Za-z가-힣]/g,
        '',
      ),
    }
  })
  const index = { entries, bySourceId }
  noticeIndexCache.set(notices, index)
  return index
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeAreaName(value: string): string {
  // '산업단지' 같은 공통 유형명을 빼고 고유한 지명 부분을 비교합니다.
  // 이 결과는 화면에서 관련 고시 후보를 찾는 데만 쓰며 공식 원문 검증은 아닙니다.
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
  noticeIndex: IndexedDevelopmentNotices,
): DevelopmentNotice[] {
  const normalizedName = normalizeAreaName(areaName)

  if (areaCategory === 'INDUSTRIAL_COMPLEX' && normalizedName.length >= 2) {
    // 짧은 지명만으로 다른 개발사업을 잘못 묶지 않도록 뒤의 유형명까지 확인합니다.
    const industrialNamePattern = new RegExp(
      `${escapeRegExp(normalizedName)}(?:일반|국가|도시첨단)?(?:산업단지|농공단지|물류단지)`,
    )
    return noticeIndex.entries
      .filter(({ normalizedTitle }) => industrialNamePattern.test(normalizedTitle))
      .map(({ notice }) => notice)
  }

  // 식별자가 없는 공공 개발사업만 이름으로 보완합니다. 유형명이 전부인
  // 지구단위계획·개발진흥지구는 여러 구역을 구별할 수 없습니다.
  if (areaCategory !== 'PUBLIC_DEVELOPMENT') return []

  const fullName = areaName
    .replace(/김해/g, '')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
  if (
    fullName.length < 4 &&
    !(fullName.length >= 3 && /\d$/.test(fullName))
  ) {
    return []
  }

  const namePattern = new RegExp(`${escapeRegExp(fullName)}(?![0-9])`)
  return noticeIndex.entries
    .filter(({ normalizedTitle }) => namePattern.test(normalizedTitle))
    .map(({ notice }) => notice)
}

export function getDevelopmentNoticeMatches(
  areaName: string,
  areaCategory: string,
  notices: DevelopmentNotice[],
  noticeSourceId = '',
): DevelopmentNotice[] {
  const noticeIndex = getNoticeIndex(notices)
  // VWorld 고시 식별자가 있으면 그 값만 신뢰합니다. 다른 고시의 제목이나
  // 요약에 구역명이 등장했다는 이유로 연결을 추가하지 않습니다.
  const matches = noticeSourceId
    ? noticeIndex.bySourceId.get(noticeSourceId) ?? []
    : getNameMatches(areaName, areaCategory, noticeIndex)
  const uniqueMatches = new Map<number, DevelopmentNotice>()

  for (const notice of matches) {
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
  let featureCache = areaNoticeCache.get(notices)
  if (!featureCache) {
    featureCache = new WeakMap<GeoJsonFeature, DevelopmentNotice[]>()
    areaNoticeCache.set(notices, featureCache)
  }
  const cached = featureCache.get(feature)
  if (cached) return cached

  const properties = feature.properties
  const matches = getDevelopmentNoticeMatches(
    String(properties.name ?? properties.categoryLabel ?? '개발 관련 구역'),
    String(properties.category ?? ''),
    notices,
    String(properties.noticeSourceId ?? ''),
  )
  featureCache.set(feature, matches)
  return matches
}

export function createDevelopmentSelection(
  feature: GeoJsonFeature,
  notices: DevelopmentNotice[],
): DevelopmentAreaSelection {
  const properties = feature.properties
  const categoryLabel = String(properties.categoryLabel ?? '개발 관련 구역')
  return {
    sourceId: String(properties.areaSourceId ?? ''),
    name: String(properties.name ?? categoryLabel),
    category: String(properties.category ?? ''),
    categoryLabel,
    stageLabel: String(properties.stageLabel ?? '공식 지정·고시 구역'),
    notices: getDevelopmentAreaNotices(feature, notices),
    imageUrl: String(
      properties.imageUrl ??
      properties.image_url ??
      properties.photoUrl ??
      properties.photo_url ??
      '',
    ) || undefined,
    imageSourceUrl: String(
      properties.imageSourceUrl ?? properties.image_source_url ?? '',
    ) || undefined,
    imageSourceName: String(
      properties.imageSourceName ?? properties.image_source_name ?? '',
    ) || undefined,
  }
}

export function resolveSelectedDevelopmentAreas(
  sourceIds: readonly string[],
  areas: GeoJsonCollection | undefined,
  notices: DevelopmentNotice[],
): DevelopmentAreaSelection[] {
  if (!areas || !sourceIds.length) return []
  const featuresById = new Map(
    areas.features.map((feature) => [
      String(feature.properties.areaSourceId ?? ''),
      feature,
    ]),
  )
  return sourceIds.flatMap((sourceId) => {
    const feature = featuresById.get(sourceId)
    return feature ? [createDevelopmentSelection(feature, notices)] : []
  })
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
  // 점에서 오른쪽으로 선을 그었을 때 경계와 만나는 횟수가 홀수면 내부입니다.
  // 각 변을 지날 때마다 inside를 뒤집는 방식(광선 교차법)입니다.
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
  // 첫 고리는 바깥 경계, 나머지는 도형 안의 빈 공간(구멍)입니다.
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
  // 좌표쌍의 신발끈 공식으로 넓이를 비교합니다. 여기서는 클릭 후보의
  // 작은 구역을 먼저 고르기 위한 상대 크기이며 공식 면적값이 아닙니다.
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

const developmentFeatureAreaCache = new WeakMap<GeoJsonFeature, number>()

export function getDevelopmentFeatureArea(feature: GeoJsonFeature): number {
  const cachedArea = developmentFeatureAreaCache.get(feature)
  if (cachedArea !== undefined) return cachedArea

  const { type, coordinates } = feature.geometry
  let area = 0
  if (type === 'Polygon') {
    area = polygonArea(coordinates)
  }
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    area = coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0)
  }
  developmentFeatureAreaCache.set(feature, area)
  return area
}

export function getClickedDevelopmentFeatures(
  areas: GeoJsonCollection | undefined,
  point: Position | null,
  clickedSourceId: string,
  visibleSourceIds?: ReadonlySet<string>,
): GeoJsonFeature[] {
  if (!areas) return []
  const clicked = areas.features.find(
    (feature) => String(feature.properties.areaSourceId ?? '') === clickedSourceId,
  )
  if (!clicked || (visibleSourceIds && !visibleSourceIds.has(clickedSourceId))) {
    return []
  }
  if (!point) return [clicked]

  // 보이는 구역만 다시 검사합니다. 숨긴 구역이 선택 목록에 나타나면
  // 사용자가 보는 지도와 클릭 결과가 서로 달라집니다.
  const overlapping = areas.features.filter((feature) => {
    const sourceId = String(feature.properties.areaSourceId ?? '')
    return (
      (!visibleSourceIds || visibleSourceIds.has(sourceId)) &&
      developmentFeatureContainsPoint(feature, point)
    )
  })
  // 지도 엔진이 클릭으로 판정한 구역은 경계점의 부동소수점 오차로
  // 자체 포함 검사에서 빠지더라도 선택 목록에 남깁니다.
  if (!overlapping.includes(clicked)) overlapping.push(clicked)
  return overlapping
    .map((feature, index) => ({ feature, index }))
    .sort((left, right) =>
      getDevelopmentFeatureArea(left.feature) -
        getDevelopmentFeatureArea(right.feature) || left.index - right.index,
    )
    .map(({ feature }) => feature)
}
