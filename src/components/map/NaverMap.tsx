import { useEffect, useRef, useState } from 'react'
import {
  getRegionCode,
  getRegionName,
  loadBoundary,
  type BoundaryType,
  type GeoJsonCollection,
} from '../../features/boundaries/boundaryLoader'
import type { AdminPopulationRegion } from '../../features/population/populationApi'
import type {
  FacilityCategory,
  FacilityItem,
} from '../../features/facilities/facilityApi'
import type { DevelopmentNotice } from '../../features/development/developmentApi'
import {
  getClickedDevelopmentFeatures,
  getDevelopmentAreaNotices,
} from '../../features/development/developmentMatching'
import {
  getBoundaryVisualStyle,
  shouldShowMapHoverPreview,
} from '../../features/map/mapPresentation'
import { recordPerformanceMilestone } from '../../lib/performanceMetrics'

interface SelectedRegion {
  name: string
  code: string
  type: BoundaryType
}

export type AddressSearchRequest =
  | {
      id: number
      kind: 'address'
      query: string
    }
  | {
      id: number
      kind: 'coordinate'
      query: string
      latitude: number
      longitude: number
      zoom?: number
    }

export interface AddressSearchResult {
  status: 'success' | 'empty' | 'outside' | 'error'
  title?: string
  subtitle?: string
  roadAddress?: string
  jibunAddress?: string
}

interface NaverMapProps {
  boundaryType: BoundaryType
  selectedRegion?: SelectedRegion | null
  comparedRegionCode?: string
  onSelectRegion: (region: SelectedRegion) => void
  onSelectFacility?: (facility: FacilityItem) => void
  onSelectDevelopmentAreas?: (sourceIds: string[]) => void
  addressSearchRequest?: AddressSearchRequest | null
  onAddressSearchResult?: (result: AddressSearchResult) => void
  onMapInteraction?: () => void
  populationItems?: AdminPopulationRegion[]
  facilityItems?: FacilityItem[]
  showBoundaryFill?: boolean
  waterways?: GeoJsonCollection
  showWaterways?: boolean
  majorRoads?: GeoJsonCollection
  showMajorRoads?: boolean
  showRoadTraffic?: boolean
  developmentAreas?: GeoJsonCollection
  visibleDevelopmentAreaIds?: ReadonlySet<string>
  showDevelopmentAreas?: boolean
  developmentNotices?: DevelopmentNotice[]
}

let naverScriptPromise: Promise<void> | null = null
let naverGeocoderScriptPromise: Promise<void> | null = null
const EMPTY_POPULATION_ITEMS: AdminPopulationRegion[] = []
const EMPTY_FACILITY_ITEMS: FacilityItem[] = []
const EMPTY_DEVELOPMENT_NOTICES: DevelopmentNotice[] = []
const WATERWAY_FILL_COLOR = '#a5d1f2'
const WATERWAY_STROKE_COLOR = '#a5d1f2'
const BOUNDARY_STROKE_COLOR = '#174a8c'
const SIX_LANE_ROAD_COLOR = '#F8D39A'
const EIGHT_PLUS_LANE_ROAD_COLOR = '#E6A65A'
const DEVELOPMENT_COLORS: Record<string, string> = {
  INDUSTRIAL_COMPLEX: '#f97316',
  DISTRICT_PLAN: '#16a34a',
  PUBLIC_DEVELOPMENT: '#ef4444',
  DEVELOPMENT_PROMOTION: '#eab308',
}
const FACILITY_MARKER_META: Record<
  FacilityCategory,
  { label: string; className: string }
> = {
  ADMIN_CENTER: {
    label: '행정복지센터',
    className: 'admin-center',
  },
  HOSPITAL: { label: '주요 의료', className: 'hospital' },
  SCHOOL: { label: '학교', className: 'school' },
  UNIVERSITY: { label: '대학교', className: 'university' },
  TRANSIT: { label: '교통거점', className: 'transit' },
  BRIDGE: { label: '교량', className: 'bridge' },
  PARK: { label: '공원', className: 'park' },
  MARKET: { label: '시장·마트', className: 'market' },
}

function getDistributionValues(
  populationItems: AdminPopulationRegion[],
): Map<string, number> {
  return new Map(
    populationItems.map((item) => [item.regionCode, item.population]),
  )
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  )
}

function summarizeText(value: string, maxLength = 110): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}…`
}

function getCoordinatePair(value: unknown): [number, number] | null {
  if (!value || typeof value !== 'object') return null
  const coordinate = value as { lng?: () => number; lat?: () => number }
  if (typeof coordinate.lng !== 'function' || typeof coordinate.lat !== 'function') {
    return null
  }
  return [coordinate.lng(), coordinate.lat()]
}

function renderDevelopmentNotices(notices: DevelopmentNotice[]): string {
  if (!notices.length) {
    return (
      '<div class="development-notice-preview empty">' +
        '<p>VWorld 공식 공간정보에 등록된 개발구역입니다.</p>' +
        '<span>김해 UPIS에서 연결할 고시를 찾지 못했습니다.</span>' +
      '</div>'
    )
  }

  return (
    '<div class="development-notice-list">' +
      notices
        .map((notice) => {
          const title = notice.sourceUrl
            ? `<a class="development-notice-title" href="${escapeHtml(notice.sourceUrl)}" ` +
              'onclick="window.open(this.href,\'OfficialNotice\',\'width=1200,height=850,scrollbars=yes,resizable=yes\'); return false;">' +
              `${escapeHtml(notice.title)}</a>`
            : `<strong class="development-notice-title is-unlinked">${escapeHtml(notice.title)}</strong>`
          let linkStatus = notice.officialLinkStatusLabel
          if (notice.sourceUrl) {
            try {
              const hostname = new URL(notice.sourceUrl).hostname
              linkStatus = hostname === 'minwon.gyeongnam.go.kr'
                ? '경상남도 공식 고시 원문'
                : hostname.endsWith('eum.go.kr')
                  ? '토지이음 공식 고시 원문'
                  : '김해시청 공식 고시공고'
            } catch {
              linkStatus = notice.officialLinkStatusLabel
            }
          }
          return (
            '<article class="development-notice-preview">' +
              title +
              `<p>${escapeHtml(summarizeText(notice.summary || notice.stageLabel))}</p>` +
              `<span>${escapeHtml(notice.noticeDate)} · ${escapeHtml(notice.noticeNumber)} · ${linkStatus}</span>` +
            '</article>'
          )
        })
        .join('') +
    '</div>'
  )
}

function createBoundaryOutlines(
  boundary: GeoJsonCollection,
): GeoJsonCollection {
  return {
    type: 'FeatureCollection',
    name: `${boundary.name ?? 'boundary'} outlines`,
    features: boundary.features.flatMap((feature, featureIndex) => {
      const { geometry } = feature
      let lineCoordinates: unknown

      if (geometry.type === 'Polygon') {
        lineCoordinates = geometry.coordinates
      } else if (geometry.type === 'MultiPolygon') {
        lineCoordinates = (geometry.coordinates as unknown[]).flat()
      } else {
        return []
      }

      return [
        {
          type: 'Feature' as const,
          properties: {
            __layer: 'boundary-outline',
            __sourceFeatureIndex: featureIndex,
          },
          geometry: {
            type: 'MultiLineString',
            coordinates: lineCoordinates,
          },
        },
      ]
    }),
  }
}

function applyPopulationStyles(
  dataLayer: NaverMapData,
  boundaryType: BoundaryType,
  populationItems: AdminPopulationRegion[],
  showBoundaryFill: boolean,
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
        strokeColor: BOUNDARY_STROKE_COLOR,
        strokeOpacity: 1,
        strokeWeight: 1.8,
        clickable: false,
        // 면을 다시 덮지 않는 선 도형이라 개발구역 위에서도 경계만 선명하게 보입니다.
        zIndex: 80,
      }
    }

    const properties: Record<string, unknown> = {
      adm_nm: feature.getProperty('adm_nm'),
      adm_cd2: feature.getProperty('adm_cd2'),
      adm_cd: feature.getProperty('adm_cd'),
      EMD_NM: feature.getProperty('EMD_NM'),
      EMD_CD: feature.getProperty('EMD_CD'),
    }
    const code = getRegionCode(properties, boundaryType)
    const population = populationByCode.get(code)
    const isSelected = Boolean(selectedRegionCode) && code === selectedRegionCode
    const isCompared = Boolean(comparedRegionCode) && code === comparedRegionCode
    return getBoundaryVisualStyle({
      population,
      maximumPopulation,
      showBoundaryFill,
      showDevelopmentAreas,
      isSelected,
      isCompared,
    })
  })
}

function createMajorRoadOverlays(collection: GeoJsonCollection): GeoJsonCollection {
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

function loadNaverMaps(clientId: string): Promise<void> {
  const loadGeocoder = (): Promise<void> => {
    if (window.naver?.maps?.Service) return Promise.resolve()
    if (naverGeocoderScriptPromise) return naverGeocoderScriptPromise

    naverGeocoderScriptPromise = new Promise((resolve, reject) => {
      const addonScript = document.createElement('script')
      addonScript.src = 'https://oapi.map.naver.com/openapi/v3/maps-geocoder.js'
      addonScript.async = true
      addonScript.onload = () => resolve()
      addonScript.onerror = () => reject(new Error('주소 검색 기능을 불러오지 못했습니다.'))
      document.head.appendChild(addonScript)
    })
    return naverGeocoderScriptPromise
  }

  if (window.naver?.maps) {
    return loadGeocoder()
  }

  if (naverScriptPromise) {
    return naverScriptPromise
  }

  naverScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')

    script.src =
      `https://oapi.map.naver.com/openapi/v3/maps.js` +
      `?ncpKeyId=${encodeURIComponent(clientId)}`

    script.async = true
    script.onload = () => void loadGeocoder().then(resolve, reject)
    script.onerror = () => {
      reject(new Error('네이버 지도 API를 불러오지 못했습니다.'))
    }

    document.head.appendChild(script)
  })

  return naverScriptPromise
}

export default function NaverMap({
  boundaryType,
  selectedRegion,
  comparedRegionCode = '',
  onSelectRegion,
  onSelectFacility,
  onSelectDevelopmentAreas,
  addressSearchRequest,
  onAddressSearchResult,
  onMapInteraction,
  populationItems = EMPTY_POPULATION_ITEMS,
  facilityItems = EMPTY_FACILITY_ITEMS,
  showBoundaryFill = true,
  waterways,
  showWaterways = true,
  majorRoads,
  showMajorRoads = true,
  showRoadTraffic = false,
  developmentAreas,
  visibleDevelopmentAreaIds,
  showDevelopmentAreas = false,
  developmentNotices = EMPTY_DEVELOPMENT_NOTICES,
}: NaverMapProps) {
  // DashboardPage가 선택·표시 조건을 전달하고, 지도 클릭은 콜백으로 되돌려줍니다.
  // NAVER 지도 객체는 React 화면 상태와 달라 ref에 보관합니다.
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<NaverMapInstance | null>(null)
  const dataLayerRef = useRef<NaverMapData | null>(null)
  const loadedBoundaryRef = useRef<GeoJsonCollection | null>(null)
  const waterwayFeaturesRef = useRef<NaverFeature[]>([])
  const majorRoadFeaturesRef = useRef<NaverFeature[]>([])
  const loadedMajorRoadsRef = useRef<GeoJsonCollection | null>(null)
  const developmentAreaFeaturesRef = useRef<NaverFeature[]>([])
  const loadedDevelopmentAreasRef = useRef<GeoJsonCollection | null>(null)
  const facilityMarkersRef = useRef<Map<number, NaverMarker>>(new Map())
  const addressSearchMarkerRef = useRef<NaverMarker | null>(null)
  const trafficLayerRef = useRef<NaverTrafficLayer | null>(null)
  const facilityInfoWindowRef = useRef<NaverInfoWindow | null>(null)
  const developmentInfoWindowRef = useRef<NaverInfoWindow | null>(null)
  const developmentInfoPinnedRef = useRef(false)
  const onSelectRegionRef = useRef(onSelectRegion)
  const onSelectFacilityRef = useRef(onSelectFacility)
  const onSelectDevelopmentAreasRef = useRef(onSelectDevelopmentAreas)
  const onAddressSearchResultRef = useRef(onAddressSearchResult)
  const populationItemsRef = useRef(populationItems)
  const populationByCodeRef = useRef(getDistributionValues(populationItems))
  const developmentAreasRef = useRef(developmentAreas)
  const visibleDevelopmentAreaIdsRef = useRef(visibleDevelopmentAreaIds)
  const showBoundaryFillRef = useRef(showBoundaryFill)
  const showWaterwaysRef = useRef(showWaterways)
  const showDevelopmentAreasRef = useRef(showDevelopmentAreas)
  const showMajorRoadsRef = useRef(showMajorRoads)
  const selectedRegionCodeRef = useRef(selectedRegion?.code ?? '')
  const comparedRegionCodeRef = useRef(comparedRegionCode)
  const developmentNoticesRef = useRef(developmentNotices)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    onSelectRegionRef.current = onSelectRegion
  }, [onSelectRegion])

  useEffect(() => {
    onSelectFacilityRef.current = onSelectFacility
  }, [onSelectFacility])

  useEffect(() => {
    onSelectDevelopmentAreasRef.current = onSelectDevelopmentAreas
  }, [onSelectDevelopmentAreas])

  useEffect(() => {
    onAddressSearchResultRef.current = onAddressSearchResult
  }, [onAddressSearchResult])

  useEffect(() => {
    developmentNoticesRef.current = developmentNotices
  }, [developmentNotices])

  useEffect(() => {
    developmentAreasRef.current = developmentAreas
  }, [developmentAreas])

  useEffect(() => {
    visibleDevelopmentAreaIdsRef.current = visibleDevelopmentAreaIds
  }, [visibleDevelopmentAreaIds])

  useEffect(() => {
    trafficLayerRef.current?.setMap(showRoadTraffic ? mapRef.current : null)
  }, [showRoadTraffic, status])

  useEffect(() => {
    const dataLayer = dataLayerRef.current
    if (!dataLayer || status !== 'ready' || !majorRoads) return
    if (loadedMajorRoadsRef.current === majorRoads) return

    // 긴 도로 선을 토글마다 삭제·재생성하면 지도가 멈춥니다.
    // 데이터가 바뀔 때만 올리고 ON/OFF는 아래 스타일 갱신에서 처리합니다.
    for (const feature of majorRoadFeaturesRef.current) {
      dataLayer.removeFeature(feature)
    }
    majorRoadFeaturesRef.current = dataLayer.addGeoJson(
      createMajorRoadOverlays(majorRoads),
    )
    loadedMajorRoadsRef.current = majorRoads
  }, [majorRoads, status])

  useEffect(() => {
    const dataLayer = dataLayerRef.current
    if (!dataLayer || status !== 'ready') return

    for (const feature of waterwayFeaturesRef.current) {
      dataLayer.removeFeature(feature)
    }
    waterwayFeaturesRef.current = []

    if (waterways && showWaterways) {
      waterwayFeaturesRef.current = dataLayer.addGeoJson(waterways)
    }
  }, [showWaterways, status, waterways])

  useEffect(() => {
    const dataLayer = dataLayerRef.current
    if (!dataLayer || status !== 'ready') return

    if (!developmentAreas || !showDevelopmentAreas) return
    if (loadedDevelopmentAreasRef.current === developmentAreas) return

    developmentInfoWindowRef.current?.close()
    developmentInfoPinnedRef.current = false
    for (const feature of developmentAreaFeaturesRef.current) {
      dataLayer.removeFeature(feature)
    }
    developmentAreaFeaturesRef.current = dataLayer.addGeoJson(developmentAreas)
    loadedDevelopmentAreasRef.current = developmentAreas
  }, [developmentAreas, showDevelopmentAreas, status])

  useEffect(() => {
    populationItemsRef.current = populationItems
    populationByCodeRef.current = getDistributionValues(populationItems)
    // 교통 정보는 지도 타일 레이어이므로 인구 면 채우기를 잠시 숨겨 가리지 않게 합니다.
    showBoundaryFillRef.current = showBoundaryFill && !showRoadTraffic
    showWaterwaysRef.current = showWaterways
    showDevelopmentAreasRef.current = showDevelopmentAreas
    showMajorRoadsRef.current = showMajorRoads
    selectedRegionCodeRef.current = selectedRegion?.code ?? ''
    comparedRegionCodeRef.current = comparedRegionCode
    if (dataLayerRef.current) {
      applyPopulationStyles(
        dataLayerRef.current,
        boundaryType,
        populationItems,
        showBoundaryFill && !showRoadTraffic,
        showWaterways,
        showDevelopmentAreas,
        visibleDevelopmentAreaIds,
        showMajorRoads,
        selectedRegion?.code ?? '',
        comparedRegionCode,
      )
    }
  }, [
    boundaryType,
    populationItems,
    showBoundaryFill,
    showRoadTraffic,
    showWaterways,
    showDevelopmentAreas,
    visibleDevelopmentAreaIds,
    showMajorRoads,
    selectedRegion?.code,
    comparedRegionCode,
  ])

  useEffect(() => {
    const maps = window.naver?.maps
    const map = mapRef.current

    if (!maps || !map || status !== 'ready') {
      return
    }

    const visibleIds = new Set(facilityItems.map((facility) => facility.id))
    for (const [id, marker] of facilityMarkersRef.current) {
      if (visibleIds.has(id)) continue
      maps.Event.clearInstanceListeners(marker)
      marker.setMap(null)
      facilityMarkersRef.current.delete(id)
    }

    if (!facilityItems.length) {
      facilityInfoWindowRef.current?.close()
      return
    }

    const infoWindow = facilityInfoWindowRef.current ?? new maps.InfoWindow({
        content: '<div class="facility-info"></div>',
        borderWidth: 0,
        backgroundColor: 'transparent',
        pixelOffset: new maps.Point(0, -14),
      })
    facilityInfoWindowRef.current = infoWindow

    for (const facility of facilityItems) {
      if (facilityMarkersRef.current.has(facility.id)) continue
      const markerMeta = FACILITY_MARKER_META[facility.category]
      const marker = new maps.Marker({
        position: new maps.LatLng(facility.latitude, facility.longitude),
        map,
        title: facility.name,
        icon: {
          content:
            '<div class="facility-marker-wrap" aria-hidden="true">' +
            '<div class="facility-marker ' + markerMeta.className + '"></div>' +
            '<small class="facility-marker-label">' + markerMeta.label + '</small>' +
            '</div>',
          anchor: new maps.Point(20, 10),
        },
      })

      maps.Event.addListener(marker, 'click', () => {
        if (onSelectFacilityRef.current) {
          infoWindow.close()
          developmentInfoWindowRef.current?.close()
          developmentInfoPinnedRef.current = false
          onSelectFacilityRef.current(facility)
          return
        }
        const address = facility.roadAddress || facility.parcelAddress || ''
        const collectedDate = facility.fetchedAt?.slice(0, 10)
        const provenance = facility.source === 'VWORLD'
          ? `VWorld 장소 검색${collectedDate ? ` · 수집 ${collectedDate}` : ''}`
          : `${facility.source}${collectedDate ? ` · 수집 ${collectedDate}` : ''}`
        infoWindow.setContent(
          '<div class="facility-info">' +
            '<small>' + escapeHtml(markerMeta.label) + '</small>' +
            '<strong>' + escapeHtml(facility.name) + '</strong>' +
            (address
              ? '<span>' + escapeHtml(address) + '</span>'
              : '') +
            '<span>' + escapeHtml(provenance) + '</span>' +
            '</div>',
        )
        infoWindow.open(map, marker)
      })

      facilityMarkersRef.current.set(facility.id, marker)
    }
  }, [facilityItems, status])

  useEffect(() => {
    const maps = window.naver?.maps
    const map = mapRef.current
    if (!maps || !map || status !== 'ready') return

    if (!addressSearchRequest) {
      addressSearchMarkerRef.current?.setMap(null)
      addressSearchMarkerRef.current = null
      return
    }

    if (addressSearchRequest.kind === 'coordinate') {
      addressSearchMarkerRef.current?.setMap(null)
      addressSearchMarkerRef.current = null
      map.morph(
        new maps.LatLng(
          addressSearchRequest.latitude,
          addressSearchRequest.longitude,
        ),
        addressSearchRequest.zoom ?? 17,
        { duration: 500 },
      )
      return
    }

    const service = maps.Service
    if (!service) {
      onAddressSearchResultRef.current?.({ status: 'error' })
      return
    }

    let active = true
    service.geocode(
      { query: addressSearchRequest.query },
      (searchStatus, response) => {
        if (!active) return
        if (searchStatus !== service.Status.OK) {
          onAddressSearchResultRef.current?.({ status: 'error' })
          return
        }

        const address = response?.v2.addresses[0]
        if (!address) {
          onAddressSearchResultRef.current?.({ status: 'empty' })
          return
        }

        const roadAddress = address.roadAddress?.trim() ?? ''
        const jibunAddress = address.jibunAddress?.trim() ?? ''
        if (![roadAddress, jibunAddress].some((value) => value.includes('김해시'))) {
          onAddressSearchResultRef.current?.({ status: 'outside' })
          return
        }

        const latitude = Number(address.y)
        const longitude = Number(address.x)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          onAddressSearchResultRef.current?.({ status: 'error' })
          return
        }

        const coordinate = new maps.LatLng(latitude, longitude)
        addressSearchMarkerRef.current?.setMap(null)
        addressSearchMarkerRef.current = new maps.Marker({
          map,
          position: coordinate,
          title: roadAddress || jibunAddress || addressSearchRequest.query,
          icon: {
            content: '<div class="address-search-marker" aria-hidden="true"><i></i></div>',
            anchor: new maps.Point(18, 40),
          },
        })
        map.morph(coordinate, 17, { duration: 500 })
        onAddressSearchResultRef.current?.({
          status: 'success',
          title: roadAddress || jibunAddress || addressSearchRequest.query,
          subtitle: roadAddress && jibunAddress ? jibunAddress : undefined,
          roadAddress: roadAddress || undefined,
          jibunAddress: jibunAddress || undefined,
        })
      },
    )

    return () => {
      active = false
    }
  }, [addressSearchRequest, status])

  useEffect(() => {
    let cancelled = false
    const facilityMarkers = facilityMarkersRef.current

    async function initializeMap() {
      setStatus('loading')
      const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID?.trim()

      if (!clientId) {
        setStatus('missing-key')
        return
      }

      try {
        await loadNaverMaps(clientId)

        const boundary = await loadBoundary(boundaryType)

        if (
          cancelled ||
          !mapElement.current ||
          !window.naver?.maps
        ) {
          return
        }

        const map = new window.naver.maps.Map(mapElement.current, {
          center: new window.naver.maps.LatLng(35.228, 128.889),
          zoom: 12,
          mapTypeId: window.naver.maps.MapTypeId.NORMAL,
          baseTileOpacity: 1,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: window.naver.maps.MapTypeControlStyle.BUTTON,
            position: window.naver.maps.Position.TOP_RIGHT,
          },
          zoomControl: true,
          zoomControlOptions: {
            style: window.naver.maps.ZoomControlStyle.SMALL,
            position: window.naver.maps.Position.RIGHT_CENTER,
          },
          scaleControl: true,
          logoControl: true,
          mapDataControl: true,
        })

        const dataLayer = map.data
        loadedBoundaryRef.current = boundary
        trafficLayerRef.current = new window.naver.maps.TrafficLayer()

        dataLayer.addGeoJson({
          ...boundary,
          features: boundary.features.map((feature) => ({
            ...feature,
            properties: {
              ...feature.properties,
              __layer: 'boundary',
            },
          })),
        })
        dataLayer.addGeoJson(createBoundaryOutlines(boundary))
        applyPopulationStyles(
          dataLayer,
          boundaryType,
          populationItemsRef.current,
          showBoundaryFillRef.current,
          showWaterwaysRef.current,
          showDevelopmentAreasRef.current,
          visibleDevelopmentAreaIdsRef.current,
          showMajorRoadsRef.current,
          selectedRegionCodeRef.current,
          comparedRegionCodeRef.current,
        )

        const hoverInfoWindow = new window.naver.maps.InfoWindow({
          content: '<div class="region-hover-label"></div>',
          borderWidth: 0,
          disableAnchor: true,
          backgroundColor: 'transparent',
          pixelOffset: new window.naver.maps.Point(0, -10),
        })

        const developmentInfoWindow = new window.naver.maps.InfoWindow({
          content: '<div class="development-info"></div>',
          borderWidth: 0,
          backgroundColor: 'transparent',
          pixelOffset: new window.naver.maps.Point(0, -12),
        })
        developmentInfoWindowRef.current = developmentInfoWindow

        dataLayer.addListener('click', (event: NaverDataPointerEvent) => {
          const layer = event.feature.getProperty('__layer')
          if (layer === 'waterway') {
            return
          }
          if (layer === 'boundary-outline') {
            return
          }
          if (layer === 'development-area') {
            if (!showDevelopmentAreasRef.current) return

            const clickedPoint = getCoordinatePair(event.coord)
            const clickedAreaSourceId = String(
              event.feature.getProperty('areaSourceId') ?? '',
            )
            const currentDevelopmentAreas = developmentAreasRef.current
            const selectedFeatures = getClickedDevelopmentFeatures(
              currentDevelopmentAreas,
              clickedPoint,
              clickedAreaSourceId,
              visibleDevelopmentAreaIdsRef.current,
            )

            if (
              onSelectDevelopmentAreasRef.current &&
              selectedFeatures.length > 0
            ) {
              hoverInfoWindow.close()
              developmentInfoWindow.close()
              developmentInfoPinnedRef.current = false
              onSelectDevelopmentAreasRef.current(selectedFeatures.map(
                (feature) => String(feature.properties.areaSourceId ?? ''),
              ))
              return
            }

            const areaSections = selectedFeatures
              .map((feature) => {
                const properties = feature.properties
                const categoryLabel = String(
                  properties.categoryLabel ?? '개발 관련 구역',
                )
                const areaName = String(properties.name ?? categoryLabel)
                const notices = getDevelopmentAreaNotices(
                  feature,
                  developmentNoticesRef.current,
                )
                return (
                  '<details class="development-area-choice">' +
                    '<summary>' +
                      `<small>${escapeHtml(categoryLabel)}</small>` +
                      `<strong>${escapeHtml(areaName)}</strong>` +
                      `<span>관련 고시 ${notices.length.toLocaleString()}건</span>` +
                    '</summary>' +
                    renderDevelopmentNotices(notices) +
                  '</details>'
                )
              })
              .join('')

            hoverInfoWindow.close()
            developmentInfoWindow.setContent(
              '<div class="development-info">' +
                '<button type="button" class="development-info-close" data-close-development-info aria-label="고시정보 닫기">' +
                  '<span aria-hidden="true">×</span>' +
                '</button>' +
                `<small>${selectedFeatures.length > 1 ? `겹친 개발구역 ${selectedFeatures.length}개 · 작은 구역부터` : 'VWorld 공식 지정구역'}</small>` +
                `<h3>${escapeHtml(selectedFeatures.length > 1 ? '확인할 구역을 골라 주세요' : String(selectedFeatures[0]?.properties.name ?? '개발 관련 구역'))}</h3>` +
                `<div class="development-area-choice-list">${areaSections}</div>` +
                '<p class="development-source-note">구역 경계: VWorld · 관련 고시: 김해 UPIS</p>' +
              '</div>',
            )
            developmentInfoPinnedRef.current = true
            developmentInfoWindow.open(map, event.coord)
            return
          }
          if (layer !== 'boundary') {
            return
          }
          developmentInfoPinnedRef.current = false
          developmentInfoWindow.close()
          const properties: Record<string, unknown> = {
            adm_nm: event.feature.getProperty('adm_nm'),
            adm_cd2: event.feature.getProperty('adm_cd2'),
            adm_cd: event.feature.getProperty('adm_cd'),
            EMD_NM: event.feature.getProperty('EMD_NM'),
            EMD_CD: event.feature.getProperty('EMD_CD'),
          }

          onSelectRegionRef.current({
            name: getRegionName(properties, boundaryType),
            code: getRegionCode(properties, boundaryType),
            type: boundaryType,
          })
        })

        dataLayer.addListener('mouseover', (event: NaverDataPointerEvent) => {
          const layer = event.feature.getProperty('__layer')
          if (layer === 'waterway') {
            return
          }
          if (layer === 'boundary-outline') {
            return
          }
          if (layer === 'development-area') {
            if (!showDevelopmentAreasRef.current) return

            const category = String(event.feature.getProperty('category') ?? '')
            const categoryLabel = String(
              event.feature.getProperty('categoryLabel') ?? '개발 관련 구역',
            )
            const name = String(
              event.feature.getProperty('name') ?? categoryLabel,
            )
            const stageLabel = String(
              event.feature.getProperty('stageLabel') ?? '공식 지정·고시 구역',
            )
            const color = DEVELOPMENT_COLORS[category] ?? '#ef4444'

            dataLayer.overrideStyle(event.feature, {
              fillColor: color,
              fillOpacity: 0.42,
              strokeColor: color,
              strokeOpacity: 1,
              strokeWeight: 4,
            })
            if (shouldShowMapHoverPreview(developmentInfoPinnedRef.current)) {
              hoverInfoWindow.setContent(
                '<div class="region-hover-label development-hover-label">' +
                  `<small>${escapeHtml(categoryLabel)}</small>` +
                  `<strong>${escapeHtml(name)}</strong>` +
                  `<span>${escapeHtml(stageLabel)}</span>` +
                  '</div>',
              )
              hoverInfoWindow.open(map, event.coord)
            }
            return
          }
          if (layer !== 'boundary') {
            return
          }
          const properties: Record<string, unknown> = {
            adm_nm: event.feature.getProperty('adm_nm'),
            adm_cd2: event.feature.getProperty('adm_cd2'),
            adm_cd: event.feature.getProperty('adm_cd'),
            EMD_NM: event.feature.getProperty('EMD_NM'),
            EMD_CD: event.feature.getProperty('EMD_CD'),
          }

          dataLayer.overrideStyle(event.feature, {
            fillColor: '#0f4f93',
            fillOpacity: showBoundaryFillRef.current ? 0.9 : 0,
            strokeColor: '#0f4f93',
            strokeWeight: 3,
          })

          const regionName = getRegionName(properties, boundaryType)
          const regionCode = getRegionCode(properties, boundaryType)
          const value = populationByCodeRef.current.get(regionCode)
          if (shouldShowMapHoverPreview(developmentInfoPinnedRef.current)) {
            hoverInfoWindow.setContent(
              '<div class="region-hover-label">' +
                `<strong>${escapeHtml(regionName)}</strong>` +
                (value === undefined
                  ? '<span>분포 데이터 없음</span>'
                  : `<span>주민등록 인구 ${value.toLocaleString()}명</span>`) +
                '</div>',
            )
            hoverInfoWindow.open(map, event.coord)
          }
        })

        dataLayer.addListener('mouseout', (event: NaverDataPointerEvent) => {
          dataLayer.revertStyle(event.feature)
          hoverInfoWindow.close()
        })

        mapRef.current = map
        dataLayerRef.current = dataLayer
        recordPerformanceMilestone('지도 사용 가능')
        setStatus('ready')
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setStatus('error')
        }
      }
    }

    void initializeMap()

    return () => {
      cancelled = true
      trafficLayerRef.current?.setMap(null)
      trafficLayerRef.current = null
      mapRef.current?.destroy?.()
      mapRef.current = null
      dataLayerRef.current = null
      loadedBoundaryRef.current = null
      waterwayFeaturesRef.current = []
      majorRoadFeaturesRef.current = []
      loadedMajorRoadsRef.current = null
      developmentAreaFeaturesRef.current = []
      loadedDevelopmentAreasRef.current = null
      for (const marker of facilityMarkers.values()) {
        window.naver?.maps?.Event.clearInstanceListeners(marker)
        marker.setMap(null)
      }
      facilityMarkers.clear()
      addressSearchMarkerRef.current?.setMap(null)
      addressSearchMarkerRef.current = null
      facilityInfoWindowRef.current?.close()
      facilityInfoWindowRef.current = null
      developmentInfoWindowRef.current?.close()
      developmentInfoWindowRef.current = null
      developmentInfoPinnedRef.current = false
    }
  }, [boundaryType])

  const closeDevelopmentInfo = () => {
    developmentInfoWindowRef.current?.close()
    developmentInfoPinnedRef.current = false
  }

  return (
    <div
      className="map-wrapper"
      onPointerDownCapture={(event) => {
        onMapInteraction?.()
        const target = event.target
        if (
          target instanceof Element &&
          target.closest('.development-info')
        ) {
          return
        }
        closeDevelopmentInfo()
      }}
      onClickCapture={(event) => {
        const target = event.target
        if (
          target instanceof Element &&
          target.closest('[data-close-development-info]')
        ) {
          closeDevelopmentInfo()
        }
      }}
    >
      <div ref={mapElement} className="naver-map" />

      {status === 'ready' && showMajorRoads && majorRoads && (
        <div className="major-road-map-note" role="status">
          <strong>주요 도로</strong>
          <span><i className="six-lane" aria-hidden="true" />6~7차로</span>
          <span><i className="eight-lane" aria-hidden="true" />8차로 이상</span>
          <small>VWorld 도로중심선</small>
        </div>
      )}

      {showDevelopmentAreas && developmentAreas?.features.length ? (
        <div className="development-map-legend" aria-label="개발계획 범례">
          <strong>공식 지정·고시 구역</strong>
          <span><i className="industrial" />산업단지</span>
          <span><i className="district" />지구단위계획</span>
          <span><i className="public" />공공 개발사업</span>
          <span><i className="promotion" />개발진흥지구</span>
          <small>
            구역 경계 VWorld · 관련 고시 김해 UPIS{' '}
            {developmentNotices.length.toLocaleString()}건
          </small>
        </div>
      ) : null}

      {status !== 'ready' && (
        <div className="map-message" aria-live="polite">
          {status === 'loading' && (
            <>
              <span className="loading-spinner map-loading-spinner" aria-hidden="true" />
              <strong>김해시 지도를 불러오는 중입니다</strong>
              <span>지역 경계와 지도 정보를 함께 불러오고 있습니다.</span>
            </>
          )}

          {status === 'missing-key' && (
            <>
              <strong>네이버 지도 Client ID가 필요합니다.</strong>
              <span>
                .env의 VITE_NAVER_MAP_CLIENT_ID 값을 확인해 주세요.
              </span>
            </>
          )}

          {status === 'error' && (
            <>
              <strong>지도를 불러오지 못했습니다.</strong>
              <span>
                Client ID와 localhost 허용 도메인을 확인해 주세요.
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
