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
  developmentFeatureContainsPoint,
  getDevelopmentAreaNotices,
  getDevelopmentFeatureArea,
} from '../../features/development/developmentMatching'

interface SelectedRegion {
  name: string
  code: string
  type: BoundaryType
}

interface NaverMapProps {
  boundaryType: BoundaryType
  onSelectRegion: (region: SelectedRegion) => void
  populationItems?: AdminPopulationRegion[]
  facilityItems?: FacilityItem[]
  showBoundaryFill?: boolean
  waterways?: GeoJsonCollection
  showWaterways?: boolean
  majorRoads?: GeoJsonCollection
  showMajorRoads?: boolean
  showRoadTraffic?: boolean
  developmentAreas?: GeoJsonCollection
  showDevelopmentAreas?: boolean
  developmentNotices?: DevelopmentNotice[]
}

let naverScriptPromise: Promise<void> | null = null
const EMPTY_POPULATION_ITEMS: AdminPopulationRegion[] = []
const EMPTY_FACILITY_ITEMS: FacilityItem[] = []
const EMPTY_DEVELOPMENT_NOTICES: DevelopmentNotice[] = []
const WATERWAY_FILL_COLOR = '#a5d1f2'
const WATERWAY_STROKE_COLOR = '#a5d1f2'
const BOUNDARY_STROKE_COLOR = '#174a8c'
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
        '<p>VWorld 공식 공간정보로 확인된 개발구역입니다.</p>' +
        '<span>연결 가능한 김해 UPIS 고시가 없습니다.</span>' +
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
          const linkStatus = notice.sourceUrl
            ? '김해시청 공식 고시공고'
            : '공식 원문 링크 미확인'
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
  showMajorRoads: boolean,
): void {
  const populationByCode = getDistributionValues(populationItems)
  const maximumPopulation = Math.max(
    ...populationByCode.values(),
    1,
  )
  const fillColors = [
    '#c8dcf2',
    '#8db4dd',
    '#578bc2',
    '#2f66a9',
    '#174a8c',
  ]

  dataLayer.setStyle((feature: NaverFeature) => {
    const layer = feature.getProperty('__layer')
    if (layer === 'major-road-casing' || layer === 'major-road-core') {
      const isCore = layer === 'major-road-core'
      const isEightPlus = feature.getProperty('laneClass') === 'eight_plus'
      return {
        strokeColor: isCore
          ? (isEightPlus ? '#ff8a29' : '#ffd166')
          : '#293b48',
        strokeOpacity: showMajorRoads ? 0.96 : 0,
        strokeWeight: showMajorRoads
          ? (isCore ? (isEightPlus ? 3.3 : 2.7) : (isEightPlus ? 6 : 5))
          : 0,
        clickable: false,
        zIndex: isCore ? 51 : 50,
      }
    }

    if (layer === 'development-area') {
      const category = String(feature.getProperty('category') ?? '')
      const color = DEVELOPMENT_COLORS[category] ?? '#ef4444'
      return {
        fillColor: color,
        fillOpacity: showDevelopmentAreas ? 0.25 : 0,
        strokeColor: color,
        strokeOpacity: showDevelopmentAreas ? 1 : 0,
        strokeWeight: showDevelopmentAreas ? 2.4 : 0,
        clickable: showDevelopmentAreas,
        // 개발구역은 행정·법정동 경계선보다 위에서 클릭되어야 합니다.
        zIndex: showDevelopmentAreas ? 60 : 0,
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
    const ratio = population ? population / maximumPopulation : 0
    const colorIndex = population
      ? Math.min(
          fillColors.length - 1,
          Math.floor(ratio * fillColors.length),
        )
      : 0

    return {
      fillColor: fillColors[colorIndex],
      fillOpacity: showBoundaryFill
        ? (population ? 0.86 : 0.45)
        : 0,
      strokeColor: BOUNDARY_STROKE_COLOR,
      strokeOpacity: 0.9,
      strokeWeight: 1.4,
      clickable: true,
      zIndex: 10,
    }
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
  if (window.naver?.maps) {
    return Promise.resolve()
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
    script.onload = () => resolve()
    script.onerror = () => {
      reject(new Error('네이버 지도 API를 불러오지 못했습니다.'))
    }

    document.head.appendChild(script)
  })

  return naverScriptPromise
}

export default function NaverMap({
  boundaryType,
  onSelectRegion,
  populationItems = EMPTY_POPULATION_ITEMS,
  facilityItems = EMPTY_FACILITY_ITEMS,
  showBoundaryFill = true,
  waterways,
  showWaterways = true,
  majorRoads,
  showMajorRoads = true,
  showRoadTraffic = false,
  developmentAreas,
  showDevelopmentAreas = false,
  developmentNotices = EMPTY_DEVELOPMENT_NOTICES,
}: NaverMapProps) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<NaverMapInstance | null>(null)
  const dataLayerRef = useRef<NaverMapData | null>(null)
  const loadedMajorRoadsRef = useRef<GeoJsonCollection | null>(null)
  const facilityMarkersRef = useRef<NaverMarker[]>([])
  const trafficLayerRef = useRef<NaverTrafficLayer | null>(null)
  const facilityInfoWindowRef = useRef<NaverInfoWindow | null>(null)
  const developmentInfoWindowRef = useRef<NaverInfoWindow | null>(null)
  const onSelectRegionRef = useRef(onSelectRegion)
  const populationItemsRef = useRef(populationItems)
  const showBoundaryFillRef = useRef(showBoundaryFill)
  const showWaterwaysRef = useRef(showWaterways)
  const showDevelopmentAreasRef = useRef(showDevelopmentAreas)
  const showMajorRoadsRef = useRef(showMajorRoads)
  const developmentNoticesRef = useRef(developmentNotices)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    onSelectRegionRef.current = onSelectRegion
  }, [onSelectRegion])

  useEffect(() => {
    developmentNoticesRef.current = developmentNotices
  }, [developmentNotices])

  useEffect(() => {
    trafficLayerRef.current?.setMap(showRoadTraffic ? mapRef.current : null)
  }, [showRoadTraffic, status])

  useEffect(() => {
    if (
      status === 'ready' &&
      dataLayerRef.current &&
      majorRoads &&
      loadedMajorRoadsRef.current !== majorRoads
    ) {
      dataLayerRef.current.addGeoJson(createMajorRoadOverlays(majorRoads))
      loadedMajorRoadsRef.current = majorRoads
      applyPopulationStyles(
        dataLayerRef.current,
        boundaryType,
        populationItemsRef.current,
        showBoundaryFillRef.current,
        showWaterwaysRef.current,
        showDevelopmentAreasRef.current,
        showMajorRoads,
      )
    }
  }, [boundaryType, majorRoads, showMajorRoads, status])

  useEffect(() => {
    populationItemsRef.current = populationItems
    // 교통 정보는 지도 타일 레이어이므로 인구 면 채우기를 잠시 숨겨 가리지 않게 합니다.
    showBoundaryFillRef.current = showBoundaryFill && !showRoadTraffic
    showWaterwaysRef.current = showWaterways
    showDevelopmentAreasRef.current = showDevelopmentAreas
    showMajorRoadsRef.current = showMajorRoads
    if (dataLayerRef.current) {
      applyPopulationStyles(
        dataLayerRef.current,
        boundaryType,
        populationItems,
        showBoundaryFill && !showRoadTraffic,
        showWaterways,
        showDevelopmentAreas,
        showMajorRoads,
      )
    }
  }, [
    boundaryType,
    populationItems,
    showBoundaryFill,
    showRoadTraffic,
    showWaterways,
    showDevelopmentAreas,
    showMajorRoads,
  ])

  useEffect(() => {
    const maps = window.naver?.maps
    const map = mapRef.current

    for (const marker of facilityMarkersRef.current) {
      maps?.Event.clearInstanceListeners(marker)
      marker.setMap(null)
    }
    facilityMarkersRef.current = []
    facilityInfoWindowRef.current?.close()

    if (!maps || !map || !facilityItems.length || status !== 'ready') {
      return
    }

    const infoWindow = new maps.InfoWindow({
      content: '<div class="facility-info"></div>',
      borderWidth: 0,
      backgroundColor: 'transparent',
      pixelOffset: new maps.Point(0, -14),
    })
    facilityInfoWindowRef.current = infoWindow

    facilityMarkersRef.current = facilityItems.map((facility) => {
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

      return marker
    })

    return () => {
      infoWindow.close()
      for (const marker of facilityMarkersRef.current) {
        maps.Event.clearInstanceListeners(marker)
        marker.setMap(null)
      }
      facilityMarkersRef.current = []
    }
  }, [facilityItems, status])

  useEffect(() => {
    let cancelled = false

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
          mapDataControl: false,
        })

        const dataLayer = map.data
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
        if (waterways) {
          dataLayer.addGeoJson(waterways)
        }
        if (developmentAreas) {
          dataLayer.addGeoJson(developmentAreas)
        }
        dataLayer.addGeoJson(createBoundaryOutlines(boundary))
        applyPopulationStyles(
          dataLayer,
          boundaryType,
          populationItemsRef.current,
          showBoundaryFillRef.current,
          showWaterwaysRef.current,
          showDevelopmentAreasRef.current,
          showMajorRoadsRef.current,
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
            const clickedFeature = developmentAreas?.features.find(
              (feature) =>
                String(feature.properties.areaSourceId ?? '') ===
                clickedAreaSourceId,
            )
            const overlappingFeatures = clickedPoint && developmentAreas
              ? developmentAreas.features
                  .filter((feature) =>
                    developmentFeatureContainsPoint(feature, clickedPoint),
                  )
                  .sort(
                    (left, right) =>
                      getDevelopmentFeatureArea(left) -
                      getDevelopmentFeatureArea(right),
                  )
              : []
            const selectedFeatures = overlappingFeatures.length
              ? overlappingFeatures
              : clickedFeature
                ? [clickedFeature]
                : []

            const areaSections = selectedFeatures
              .map((feature, index) => {
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
                  `<details class="development-area-choice"${index === 0 ? ' open' : ''}>` +
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
                `<small>${selectedFeatures.length > 1 ? `겹친 개발구역 ${selectedFeatures.length}개 · 작은 구역부터` : 'VWorld 공식 지정구역'}</small>` +
                `<h3>${escapeHtml(selectedFeatures.length > 1 ? '확인할 구역을 선택하세요' : String(selectedFeatures[0]?.properties.name ?? '개발 관련 구역'))}</h3>` +
                `<div class="development-area-choice-list">${areaSections}</div>` +
                '<p class="development-source-note">구역 경계: VWorld · 관련 고시: 김해 UPIS</p>' +
              '</div>',
            )
            developmentInfoWindow.open(map, event.coord)
            return
          }
          if (layer !== 'boundary') {
            return
          }
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
            hoverInfoWindow.setContent(
              '<div class="region-hover-label development-hover-label">' +
                `<small>${escapeHtml(categoryLabel)}</small>` +
                `<strong>${escapeHtml(name)}</strong>` +
                `<span>${escapeHtml(stageLabel)}</span>` +
                '</div>',
            )
            hoverInfoWindow.open(map, event.coord)
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
          const value = getDistributionValues(populationItemsRef.current).get(
            regionCode,
          )
          hoverInfoWindow.setContent(
            '<div class="region-hover-label">' +
              `<strong>${escapeHtml(regionName)}</strong>` +
              (value === undefined
                ? '<span>분포 데이터 없음</span>'
                : `<span>주민등록 인구 ${value.toLocaleString()}명</span>`) +
              '</div>',
          )
          hoverInfoWindow.open(map, event.coord)
        })

        dataLayer.addListener('mouseout', () => {
          dataLayer.revertStyle()
          hoverInfoWindow.close()
        })

        mapRef.current = map
        dataLayerRef.current = dataLayer
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
      loadedMajorRoadsRef.current = null
      facilityInfoWindowRef.current?.close()
      facilityInfoWindowRef.current = null
      developmentInfoWindowRef.current?.close()
      developmentInfoWindowRef.current = null
    }
  }, [boundaryType, developmentAreas, waterways])

  return (
    <div className="map-wrapper">
      <div ref={mapElement} className="naver-map" />

      {status === 'ready' && showMajorRoads && majorRoads && (
        <div className="major-road-map-note" role="status">
          <i aria-hidden="true" />
          <span>주요 도로 · 차로 수 6 이상</span>
          <small>VWorld 도로중심선</small>
        </div>
      )}

      {status === 'ready' && showRoadTraffic && (
        <div className={`traffic-map-note ${showMajorRoads && majorRoads ? 'with-road-note' : ''}`} role="status">
          도로 교통상황 표시 중 · 인구 색상 일시 숨김
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
        <div className="map-message">
          {status === 'loading' && '지도를 불러오는 중입니다.'}

          {status === 'missing-key' && (
            <>
              <strong>네이버 지도 Client ID가 필요합니다.</strong>
              <span>
                .env의 VITE_NAVER_MAP_CLIENT_ID 값을 확인해주세요.
              </span>
            </>
          )}

          {status === 'error' && (
            <>
              <strong>지도를 불러오지 못했습니다.</strong>
              <span>
                Client ID와 localhost 허용 도메인을 확인해주세요.
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
