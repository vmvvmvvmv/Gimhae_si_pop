import { useEffect, useRef, useState } from 'react'
import { installOfficialNoticeLinkHandler } from '../../features/development/officialNoticeUrl'
import {
  getRegionCode,
  getRegionName,
  loadBoundary,
  type BoundaryType,
  type GeoJsonCollection,
} from '../../features/boundaries/boundaryLoader'
import type { AdminPopulationRegion } from '../../features/population/populationApi'
import type { FacilityItem } from '../../features/facilities/facilityApi'
import type { DevelopmentNotice } from '../../features/development/developmentApi'
import {
  getClickedDevelopmentFeatures,
} from '../../features/development/developmentMatching'
import { clampMapCenter, shouldShowMapHoverPreview } from '../../features/map/mapPresentation'
import { recordPerformanceMilestone } from '../../lib/performanceMetrics'
import { DevelopmentMapLegend, MajorRoadNote, MapStatusMessage } from './MapNotes'
import { renderDevelopmentAreaInfo, renderDevelopmentHover, renderRegionHover } from './naverMapContent'
import { loadNaverMaps } from './naverMapLoader'
import {
  DEVELOPMENT_COLORS,
  NO_POPULATION_COLORS,
  applyPopulationStyles,
  createBoundaryOutlines,
  createMajorRoadOverlays,
  getBoundaryProperties,
  getCoordinatePair,
  getDistributionValues,
} from './naverMapStyles'
import { useAddressSearch, useFacilityMarkers } from './useNaverMapOverlays'

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

const EMPTY_POPULATION_ITEMS: AdminPopulationRegion[] = []
const EMPTY_FACILITY_ITEMS: FacilityItem[] = []
const EMPTY_DEVELOPMENT_NOTICES: DevelopmentNotice[] = []
// 좁은 화면에서도 김해시 전체가 들어오는 가장 작은 축척입니다.
const GIMHAE_MIN_ZOOM = 11


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
  const boundaryTypeRef = useRef(boundaryType)
  const boundaryFeaturesRef = useRef<NaverFeature[]>([])
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
  const styledPopulationItemsRef = useRef(
    showBoundaryFill && !showRoadTraffic ? populationItems : NO_POPULATION_COLORS,
  )
  const showWaterwaysRef = useRef(showWaterways)
  const showDevelopmentAreasRef = useRef(showDevelopmentAreas)
  const showMajorRoadsRef = useRef(showMajorRoads)
  const selectedRegionCodeRef = useRef(selectedRegion?.code ?? '')
  const comparedRegionCodeRef = useRef(comparedRegionCode)
  const developmentNoticesRef = useRef(developmentNotices)
  const [status, setStatus] = useState('loading')

  // NAVER 지도 이벤트는 React가 처음 등록한 콜백을 계속 기억합니다.
  // ref를 최신 props로 갱신하면 오래된 선택 상태를 참조하지 않습니다.
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
    const styledPopulationItems = showBoundaryFill && !showRoadTraffic ? populationItems : NO_POPULATION_COLORS
    styledPopulationItemsRef.current = styledPopulationItems
    showWaterwaysRef.current = showWaterways
    showDevelopmentAreasRef.current = showDevelopmentAreas
    showMajorRoadsRef.current = showMajorRoads
    selectedRegionCodeRef.current = selectedRegion?.code ?? ''
    comparedRegionCodeRef.current = comparedRegionCode
    if (dataLayerRef.current) {
      applyPopulationStyles(
        dataLayerRef.current,
        boundaryType,
        styledPopulationItems,
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

  useFacilityMarkers({
    mapRef,
    facilityMarkersRef,
    facilityInfoWindowRef,
    developmentInfoWindowRef,
    developmentInfoPinnedRef,
    onSelectFacilityRef,
    facilityItems,
    status,
  })

  useAddressSearch({
    mapRef,
    addressSearchMarkerRef,
    onAddressSearchResultRef,
    addressSearchRequest,
    status,
  })

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
          minZoom: GIMHAE_MIN_ZOOM,
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
        trafficLayerRef.current = new window.naver.maps.TrafficLayer()

        // maxBounds는 범위 밖 배경을 그리지 않아 큰 화면에 빈 공간이 생깁니다. 멈춘 뒤 중심만 김해 안으로 되돌립니다.
        window.naver.maps.Event.addListener(map, 'idle', () => {
          const center = getCoordinatePair(map.getCenter())
          if (!center) return
          const [longitude, latitude] = clampMapCenter(center[0], center[1])
          if (longitude !== center[0] || latitude !== center[1]) {
            map.panTo(new window.naver!.maps!.LatLng(latitude, longitude))
          }
        })

        applyPopulationStyles(
          dataLayer,
          boundaryTypeRef.current,
          styledPopulationItemsRef.current,
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
        installOfficialNoticeLinkHandler()

        dataLayer.addListener('click', (event: NaverDataPointerEvent) => {
          // 경계·도로·개발구역이 한 Data 레이어에 있으므로 종류를 먼저 구분합니다.
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
            // 지도 엔진은 겹친 도형 중 하나만 알려 줍니다. 클릭 좌표로
            // 실제로 겹친 구역을 다시 찾아 왼쪽 설명창에 함께 전달합니다.
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

            hoverInfoWindow.close()
            developmentInfoWindow.setContent(
              renderDevelopmentAreaInfo(selectedFeatures, developmentNoticesRef.current),
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
          const properties = getBoundaryProperties(event.feature)

          // 지도는 선택한 지역의 이름·코드·유형을 부모에게 알립니다.
          // 지역별 조회와 패널 변경은 DashboardPage에서 처리합니다.
          onSelectRegionRef.current({
            name: getRegionName(properties, boundaryTypeRef.current),
            code: getRegionCode(properties, boundaryTypeRef.current),
            type: boundaryTypeRef.current,
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
              hoverInfoWindow.setContent(renderDevelopmentHover(categoryLabel, name, stageLabel))
              hoverInfoWindow.open(map, event.coord)
            }
            return
          }
          if (layer !== 'boundary') {
            return
          }
          const properties = getBoundaryProperties(event.feature)

          dataLayer.overrideStyle(event.feature, {
            fillColor: '#0f4f93',
            fillOpacity: 0.9,
            strokeColor: '#0f4f93',
            strokeWeight: 3,
          })

          const regionName = getRegionName(properties, boundaryTypeRef.current)
          const regionCode = getRegionCode(properties, boundaryTypeRef.current)
          const value = populationByCodeRef.current.get(regionCode)
          if (shouldShowMapHoverPreview(developmentInfoPinnedRef.current)) {
            hoverInfoWindow.setContent(renderRegionHover(regionName, value))
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
      if (mapRef.current) window.naver?.maps?.Event.clearInstanceListeners(mapRef.current)
      trafficLayerRef.current?.setMap(null)
      trafficLayerRef.current = null
      mapRef.current?.destroy?.()
      mapRef.current = null
      dataLayerRef.current = null
      boundaryFeaturesRef.current = []
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
  }, [])

  // 지도를 새로 만들면 네이버 지도 호출이 1건 늘어나므로, 행정동·법정동을 바꿀 때는 경계 도형만 교체합니다.
  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false

    loadBoundary(boundaryType)
      .then((boundary) => {
        const dataLayer = dataLayerRef.current
        if (cancelled || !dataLayer) return

        for (const feature of boundaryFeaturesRef.current) {
          dataLayer.removeFeature(feature)
        }
        boundaryTypeRef.current = boundaryType
        boundaryFeaturesRef.current = [
          ...dataLayer.addGeoJson({
            ...boundary,
            features: boundary.features.map((feature) => ({
              ...feature,
              properties: { ...feature.properties, __layer: 'boundary' },
            })),
          }),
          ...dataLayer.addGeoJson(createBoundaryOutlines(boundary)),
        ]
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [boundaryType, status])

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
      {status === 'ready' && showMajorRoads && majorRoads && <MajorRoadNote />}

      {showDevelopmentAreas && developmentAreas?.features.length ? (
        <DevelopmentMapLegend noticeCount={developmentNotices.length} />
      ) : null}

      {status !== 'ready' && <MapStatusMessage status={status} />}
    </div>
  )
}
