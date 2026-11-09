import {
  getRegionCode,
  type BoundaryType,
  type GeoJsonCollection,
} from '../../features/boundaries/boundaryLoader'
import { getBoundaryVisualStyle } from '../../features/map/mapPresentation'
import type { AdminPopulationRegion } from '../../features/population/populationApi'

// 네이버 지도 Data 레이어에 올릴 도형과 도형별 표시 규칙입니다.
const WATERWAY_FILL_COLOR = '#a5d1f2'
const WATERWAY_STROKE_COLOR = '#a5d1f2'
const BOUNDARY_STROKE_COLOR = '#174a8c'
const SIX_LANE_ROAD_COLOR = '#F8D39A'
const EIGHT_PLUS_LANE_ROAD_COLOR = '#E6A65A'
export const DEVELOPMENT_COLORS: Record<string, string> = {
  INDUSTRIAL_COMPLEX: '#f97316',
  DISTRICT_PLAN: '#16a34a',
  PUBLIC_DEVELOPMENT: '#ef4444',
  DEVELOPMENT_PROMOTION: '#eab308',
}

export function getDistributionValues(
  populationItems: AdminPopulationRegion[],
): Map<string, number> {
  return new Map(
    populationItems.map((item) => [item.regionCode, item.population]),
  )
}

export function getCoordinatePair(value: unknown): [number, number] | null {
  if (!value || typeof value !== 'object') return null
  const coordinate = value as { lng?: () => number; lat?: () => number }
  if (typeof coordinate.lng !== 'function' || typeof coordinate.lat !== 'function') {
    return null
  }
  return [coordinate.lng(), coordinate.lat()]
}

// 지역 코드와 이름을 찾을 때 쓰는 경계 속성만 꺼냅니다.
export function getBoundaryProperties(feature: NaverFeature): Record<string, unknown> {
  return {
    adm_nm: feature.getProperty('adm_nm'),
    adm_cd2: feature.getProperty('adm_cd2'),
    adm_cd: feature.getProperty('adm_cd'),
    EMD_NM: feature.getProperty('EMD_NM'),
    EMD_CD: feature.getProperty('EMD_CD'),
  }
}

// 네이버 Data 레이어는 선 도형을 구간마다 별도 SVG로 그려서, 경계를 선으로 올리면 이동·확대가 느려집니다.
// 면 도형은 하나의 SVG로 그려지므로 채우기만 투명하게 한 면으로 경계선을 표시합니다.
export function createBoundaryOutlines(
  boundary: GeoJsonCollection,
): GeoJsonCollection {
  return {
    type: 'FeatureCollection',
    name: `${boundary.name ?? 'boundary'} outlines`,
    features: boundary.features
      .filter(({ geometry }) => geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
      .map((feature) => ({
        type: 'Feature' as const,
        properties: { __layer: 'boundary-outline' },
        geometry: feature.geometry,
      })),
  }
}

// 색상 필터를 끄거나 도로 혼잡도를 켜면 인구 값 없이 그려서 모든 지역을 같은 연한 색으로 표시합니다.
export const NO_POPULATION_COLORS: AdminPopulationRegion[] = []

export function applyPopulationStyles(
  dataLayer: NaverMapData,
  boundaryType: BoundaryType,
  populationItems: AdminPopulationRegion[],
  showWaterways: boolean,
  showDevelopmentAreas: boolean,
  visibleDevelopmentAreaIds: ReadonlySet<string> | undefined,
  showMajorRoads: boolean,
  selectedRegionCode: string,
  comparedRegionCode: string,
): void {
  const populationByCode = getDistributionValues(populationItems)
  const maximumPopulation = Math.max(
    ...populationByCode.values(),
    1,
  )
  dataLayer.setStyle((feature: NaverFeature) => {
    const layer = feature.getProperty('__layer')
    if (layer === 'major-road-casing' || layer === 'major-road-core') {
      const isCore = layer === 'major-road-core'
      const isEightPlus = feature.getProperty('laneClass') === 'eight_plus'
      return {
        strokeColor: isCore
          ? (isEightPlus
              ? EIGHT_PLUS_LANE_ROAD_COLOR
              : SIX_LANE_ROAD_COLOR)
          : '#65727d',
        strokeOpacity: showMajorRoads ? (isCore ? 1 : 0.94) : 0,
        strokeWeight: showMajorRoads
          ? (isCore ? (isEightPlus ? 3.7 : 3.1) : (isEightPlus ? 6.7 : 5.9))
          : 0,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
        zIndex: isCore ? 41 : 40,
      }
    }

    if (layer === 'development-area') {
      const category = String(feature.getProperty('category') ?? '')
      const color = DEVELOPMENT_COLORS[category] ?? '#ef4444'
      const areaSourceId = String(feature.getProperty('areaSourceId') ?? '')
      const isVisible = showDevelopmentAreas &&
        (!visibleDevelopmentAreaIds || visibleDevelopmentAreaIds.has(areaSourceId))
      return {
        fillColor: color,
        fillOpacity: isVisible ? 0.25 : 0,
        strokeColor: color,
        strokeOpacity: isVisible ? 1 : 0,
        strokeWeight: isVisible ? 2.4 : 0,
        clickable: isVisible,
        // 개발구역은 행정·법정동 경계선보다 위에서 클릭되어야 합니다.
        zIndex: isVisible ? 60 : 0,
      }
    }

    if (feature.getProperty('__layer') === 'waterway') {
      return {
        fillColor: WATERWAY_FILL_COLOR,
        fillOpacity: showWaterways ? 0.72 : 0,
        strokeColor: WATERWAY_STROKE_COLOR,
        strokeOpacity: showWaterways ? 0.95 : 0,
        strokeWeight: showWaterways ? 2.2 : 0,
        clickable: false,
        zIndex: 20,
      }
    }

    if (feature.getProperty('__layer') === 'boundary-outline') {
      return {
        fillOpacity: 0,
        strokeColor: BOUNDARY_STROKE_COLOR,
        strokeOpacity: 1,
        strokeWeight: 1.8,
        clickable: false,
        // 면을 다시 덮지 않는 선 도형이라 개발구역 위에서도 경계만 선명하게 보입니다.
        zIndex: 80,
      }
    }

    const properties = getBoundaryProperties(feature)
    const code = getRegionCode(properties, boundaryType)
    const population = populationByCode.get(code)
    const isSelected = Boolean(selectedRegionCode) && code === selectedRegionCode
    const isCompared = Boolean(comparedRegionCode) && code === comparedRegionCode
    return getBoundaryVisualStyle({
      population,
      maximumPopulation,
      showDevelopmentAreas,
      isSelected,
      isCompared,
    })
  })
}

export function createMajorRoadOverlays(collection: GeoJsonCollection): GeoJsonCollection {
  return {
    ...collection,
    features: collection.features.flatMap((feature) => [
      {
        ...feature,
        properties: { ...feature.properties, __layer: 'major-road-casing' },
      },
      {
        ...feature,
        properties: { ...feature.properties, __layer: 'major-road-core' },
      },
    ]),
  }
}
