import proj4 from 'proj4'

export type BoundaryType = 'administrative' | 'legal'

export interface GeoJsonFeature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: {
    type: string
    coordinates: unknown
  }
}

export interface GeoJsonCollection {
  type: 'FeatureCollection'
  name?: string
  metadata?: Record<string, unknown>
  crs?: {
    type?: string
    properties?: {
      name?: string
    }
  }
  features: GeoJsonFeature[]
}

const EPSG_5186 =
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs +type=crs'

proj4.defs('EPSG:5186', EPSG_5186)

// 원본 경계 좌표계(EPSG:5186)를 NAVER 지도에 표시할 위경도(EPSG:4326)로 바꿉니다.
function transformCoordinates(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value
  }

  const isCoordinate =
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'

  if (isCoordinate) {
    const [lng, lat] = proj4('EPSG:5186', 'EPSG:4326', [
      value[0],
      value[1],
    ])

    return [lng, lat, ...value.slice(2)]
  }

  return value.map(transformCoordinates)
}

export function normalizeBoundary(
  collection: GeoJsonCollection,
): GeoJsonCollection {
  const crsName = collection.crs?.properties?.name ?? ''

  if (!crsName.includes('5186')) {
    return collection
  }

  return {
    ...collection,
    crs: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:OGC:1.3:CRS84',
      },
    },
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: transformCoordinates(feature.geometry.coordinates),
      },
    })),
  }
}

export async function loadBoundary(
  boundaryType: BoundaryType,
): Promise<GeoJsonCollection> {
  // 인구 통계는 API에서, 경계 모양은 가벼운 표시용 GeoJSON 파일에서 가져옵니다.
  const path =
    boundaryType === 'administrative'
      ? '/data/gimhae_hangjeongdong.render.geojson'
      : '/data/Gimhae_si.render.geojson'

  const response = await fetch(path)

  if (!response.ok) {
    throw new Error('GeoJSON 파일을 불러오지 못했습니다.')
  }

  const data = (await response.json()) as GeoJsonCollection
  return normalizeBoundary(data)
}

export function getRegionName(
  properties: Record<string, unknown>,
  boundaryType: BoundaryType,
): string {
  if (boundaryType === 'administrative') {
    return String(properties.adm_nm ?? '행정구역')
  }

  return String(properties.EMD_NM ?? '법정동')
}

export function getRegionCode(
  properties: Record<string, unknown>,
  boundaryType: BoundaryType,
): string {
  if (boundaryType === 'administrative') {
    return String(properties.adm_cd2 ?? properties.adm_cd ?? '')
  }

  return String(properties.EMD_CD ?? '')
}

export async function loadWaterways(): Promise<GeoJsonCollection> {
  const response = await fetch('/data/gimhae_waterways.render.geojson')

  if (!response.ok) {
    throw new Error('하천망 GeoJSON 파일을 불러오지 못했습니다.')
  }

  return (await response.json()) as GeoJsonCollection
}

export async function loadMajorRoads(): Promise<GeoJsonCollection> {
  const response = await fetch('/data/gimhae_major_roads.render.geojson')

  if (!response.ok) {
    throw new Error('주요 도로 GeoJSON 파일을 불러오지 못했습니다.')
  }

  return (await response.json()) as GeoJsonCollection
}

export async function loadDevelopmentAreas(): Promise<GeoJsonCollection> {
  const response = await fetch('/data/gimhae_development_areas.render.geojson')

  if (!response.ok) {
    throw new Error('개발 관련 구역 GeoJSON 파일을 불러오지 못했습니다.')
  }

  return (await response.json()) as GeoJsonCollection
}
