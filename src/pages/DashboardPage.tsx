import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import AgeDistributionChart from '../components/common/AgeDistributionChart'
import PopulationTrendChart from '../components/common/PopulationTrendChart'
import RegionComparisonTable from '../components/common/RegionComparisonTable'
import PopulationCsvExport from '../components/common/PopulationCsvExport'
import TwoRegionComparison from '../components/common/TwoRegionComparison'
import WelcomeGuide from '../components/common/WelcomeGuide'
import NaverMap, {
  type AddressSearchRequest,
  type AddressSearchResult,
} from '../components/map/NaverMap'
import NaverRoadview from '../components/map/NaverRoadview'
import {
  getRegionCode,
  getRegionName,
  loadBoundary,
  loadDevelopmentAreas,
  loadMajorRoads,
  loadWaterways,
  type BoundaryType,
  type GeoJsonFeature,
} from '../features/boundaries/boundaryLoader'
import {
  countFacilitiesByCategory,
  featuresIntersect,
} from '../features/boundaries/spatialAnalysis'
import {
  fetchPopulation,
  fetchPopulationComparison,
  fetchPopulationAvailability,
  fetchPopulationTrend,
  fetchSimilarDensity,
} from '../features/population/populationApi'
import {
  selectComparisonBaseMonth,
  selectPopulationMonth,
  selectPopulationMonthInYear,
} from '../features/population/availabilitySelection'
import {
  FACILITY_OPTIONS,
  fetchFacilities,
  type FacilityCategory,
  type FacilityItem,
} from '../features/facilities/facilityApi'
import mapIcon from '../assets/map_icon.png'
import { fetchDevelopmentNotices } from '../features/development/developmentApi'
import {
  createDevelopmentSelection,
  getDevelopmentAreaMetadata,
  getDevelopmentFeatureArea,
  resolveSelectedDevelopmentAreas,
  type DevelopmentAreaSelection,
} from '../features/development/developmentMatching'
import {
  toggleMapControlPopover,
  type MapControlPopover,
} from '../features/map/mapPresentation'
import { recordPerformanceMilestone } from '../lib/performanceMetrics'
import {
  rememberWelcomeGuide,
  shouldShowWelcomeGuide,
} from '../features/onboarding/welcomeGuideStorage'
import './DashboardPage.css'

interface SelectedRegion {
  name: string
  code: string
  type: BoundaryType
}

interface RegionPairComparison {
  type: BoundaryType
  firstCode: string
  secondCode: string | null
  pickingSecond: boolean
}

// 두 동 비교는 임시 비활성화. 다시 사용할 때 true로 변경합니다.
const ENABLE_TWO_REGION_COMPARISON = false

type DetailTab = 'summary' | 'change' | 'age' | 'ranking'
type SidePanelView = 'region' | 'development' | 'facility'
type SiteSearchResult =
  | {
      id: string
      type: 'region'
      title: string
      subtitle: string
      score: number
      region: SelectedRegion
    }
  | {
      id: string
      type: 'development'
      title: string
      subtitle: string
      score: number
      feature: GeoJsonFeature
      selection: DevelopmentAreaSelection
    }
  | {
      id: string
      type: 'facility'
      title: string
      subtitle: string
      score: number
      facility: FacilityItem
    }
type RailIconName =
  | 'map'
  | 'search'
  | 'detail'
  | 'layers'
  | 'development'
  | 'facility'

function DashboardRailIcon({ name }: { name: RailIconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {name === 'map' && (
        <>
          <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" />
          <path d="M9 4v14M15 6v14" />
        </>
      )}
      {name === 'search' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 4.5 4.5" />
        </>
      )}
      {name === 'detail' && (
        <>
          <rect x="4" y="3" width="16" height="18" rx="3" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      )}
      {name === 'layers' && (
        <>
          <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
          <path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" />
        </>
      )}
      {name === 'development' && (
        <>
          <path d="M4 19V8l5-3 6 3 5-3v11l-5 3-6-3-5 3Z" />
          <path d="M9 5v11M15 8v11" />
        </>
      )}
      {name === 'facility' && (
        <>
          <path d="M4 20V9l8-5 8 5v11H4Z" />
          <path d="M9 20v-6h6v6M8 10h.01M12 10h.01M16 10h.01" />
        </>
      )}
    </svg>
  )
}

function formatChange(change: number | null, changeRate: number | null) {
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

function formatLegendPopulation(value: number): string {
  if (value >= 10_000) {
    const tenThousands = value / 10_000
    return `${tenThousands >= 10 ? Math.round(tenThousands) : tenThousands.toFixed(1)}만`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}천`
  }
  return value.toLocaleString()
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/경상남도|김해시/g, '')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .toLocaleLowerCase('ko-KR')
}

function getSearchScore(value: string, query: string): number {
  const normalizedValue = normalizeSearchText(value)
  if (normalizedValue === query) return 0
  if (normalizedValue.startsWith(query)) return 1
  return normalizedValue.includes(query) ? 2 : Number.POSITIVE_INFINITY
}

function getFeatureCenter(feature: GeoJsonFeature): {
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

export default function DashboardPage() {
  // 이 페이지가 지도·조회 조건·선택 지역·상세 패널의 공통 상태를 소유합니다.
  // 지도와 목록 같은 자식 컴포넌트는 필요한 값과 선택 함수를 props로 받습니다.
  const mapHeadingRef = useRef<HTMLDivElement>(null)
  const [isWelcomeGuideOpen, setIsWelcomeGuideOpen] = useState(shouldShowWelcomeGuide)
  const [boundaryType, setBoundaryType] =
    useState<BoundaryType>('administrative')
  const [selectedRegion, setSelectedRegion] =
    useState<SelectedRegion | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('summary')
  const [pairComparison, setPairComparison] = useState<RegionPairComparison | null>(null)
  const [sidePanelView, setSidePanelView] = useState<SidePanelView>('region')
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false)
  const [selectedDevelopmentAreaIds, setSelectedDevelopmentAreaIds] = useState<string[]>([])
  const [selectedFacility, setSelectedFacility] =
    useState<FacilityItem | null>(null)
  const [selectedStatsYm, setSelectedStatsYm] = useState<string | null>(null)
  const [comparisonBaseYm, setComparisonBaseYm] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [addressSearchRequest, setAddressSearchRequest] =
    useState<AddressSearchRequest | null>(null)
  const [addressSearchFeedback, setAddressSearchFeedback] = useState<
    AddressSearchResult | { status: 'loading' } | null
  >(null)
  const addressSearchSequenceRef = useRef(0)
  const [visibleFacilityCategories, setVisibleFacilityCategories] = useState<
    FacilityCategory[]
  >(['ADMIN_CENTER', 'HOSPITAL', 'TRANSIT', 'BRIDGE'])
  const [compactFacilityControls, setCompactFacilityControls] = useState(true)
  const [openMapControl, setOpenMapControl] =
    useState<MapControlPopover | null>(null)
  const [showBoundaryFill, setShowBoundaryFill] = useState(true)
  const [showWaterways, setShowWaterways] = useState(true)
  const [showMajorRoads, setShowMajorRoads] = useState(true)
  const [showRoadTraffic, setShowRoadTraffic] = useState(false)
  const [showDevelopmentAreas, setShowDevelopmentAreas] = useState(false)
  const [developmentYearFilter, setDevelopmentYearFilter] = useState('all')
  const [hideEndedDevelopmentAreas, setHideEndedDevelopmentAreas] =
    useState(false)

  const closeWelcomeGuide = useCallback(() => {
    // 완료와 건너뛰기를 모두 기록해 다음 방문에는 자동으로 다시 띄우지 않습니다.
    rememberWelcomeGuide()
    setIsWelcomeGuideOpen(false)
  }, [])

  const openWelcomeGuide = () => {
    // 다시 볼 때 패널이 접혀 있으면 상세 정보 강조 대상이 보이지 않습니다.
    setIsSidePanelCollapsed(false)
    setIsWelcomeGuideOpen(true)
  }

  // 지도에서 동을 누르거나 검색 결과를 고르면 이 함수가 실행됩니다.
  // 선택값은 여기서 기억하고,
  // 아래의 지역별 조회와 상세 패널이 그 값을 함께 사용합니다.
  const selectRegion = (region: SelectedRegion) => {
    if (
      pairComparison?.pickingSecond &&
      pairComparison.type === region.type &&
      pairComparison.firstCode !== region.code
    ) {
      setPairComparison({ ...pairComparison, secondCode: region.code, pickingSecond: false })
      setDetailTab('ranking')
    } else if (
      pairComparison?.pickingSecond &&
      pairComparison.type === region.type &&
      pairComparison.firstCode === region.code
    ) {
      setDetailTab('ranking')
    } else {
      setPairComparison(null)
      setDetailTab('summary')
      setSelectedRegion(region)
    }
    setSidePanelView('region')
    setIsSidePanelCollapsed(false)
    setOpenMapControl(null)
  }

  const populationLevel =
    boundaryType === 'administrative' ? 'admin' : 'legal'

  // 1) DB에 저장된 월 목록 → 2) 사용할 월 선택 → 3) 해당 월 인구 조회 순서입니다.
  // useQuery의 queryKey가 달라지면 새 자료를 요청하고, 같은 키는 캐시를 재사용합니다.
  const availabilityQuery = useQuery({
    queryKey: ['population-availability'],
    queryFn: fetchPopulationAvailability,
    staleTime: 60_000,
  })

  const availabilityItems = useMemo(() => {
    return availabilityQuery.data?.items.filter(
      (item) => item.level === populationLevel,
    ) ?? []
  }, [availabilityQuery.data, populationLevel])

  const availableMonths = useMemo(
    () => availabilityItems.map((item) => item.statsYm),
    [availabilityItems],
  )

  const availableYears = useMemo(() => {
    return Array.from(
      new Set(availableMonths.map((statsYm) => Number(statsYm.slice(0, 4)))),
    ).sort((left, right) => right - left)
  }, [availableMonths])

  const effectiveStatsYm = useMemo(() => {
    // 목록을 받기 전에는 202512를 임시로 쓰지만, 실제 요청은 아래
    // populationQuery의 enabled 조건 때문에 저장된 월을 확인한 뒤 시작합니다.
    return selectPopulationMonth(
      availabilityItems,
      populationLevel,
      selectedStatsYm,
    ) || '202512'
  }, [availabilityItems, populationLevel, selectedStatsYm])

  const effectiveYear = Number(effectiveStatsYm.slice(0, 4))
  const effectiveMonth = Number(effectiveStatsYm.slice(4))
  const selectedMonthAvailability = availabilityItems.find(
    (item) => item.statsYm === effectiveStatsYm,
  )

  const effectiveComparisonBaseYm = useMemo(() => {
    return selectComparisonBaseMonth(
      availabilityItems,
      populationLevel,
      effectiveStatsYm,
      comparisonBaseYm,
    )
  }, [
    availabilityItems,
    comparisonBaseYm,
    effectiveStatsYm,
    populationLevel,
  ])
  const comparisonBaseAvailability = availabilityItems.find(
    (item) => item.statsYm === effectiveComparisonBaseYm,
  )

  const availableMonthsInYear = useMemo(() => {
    return availableMonths
      .filter((statsYm) => Number(statsYm.slice(0, 4)) === effectiveYear)
      .map((statsYm) => Number(statsYm.slice(4)))
  }, [availableMonths, effectiveYear])

  const populationQuery = useQuery({
    // 행정동/법정동 또는 월이 바뀌면 queryKey가 달라져 해당 자료를 다시 읽습니다.
    queryKey: ['population', populationLevel, effectiveYear, effectiveMonth],
    queryFn: () =>
      fetchPopulation(populationLevel, effectiveYear, effectiveMonth),
    enabled: availableMonths.length > 0,
  })

  useEffect(() => {
    if (availabilityQuery.data) {
      recordPerformanceMilestone('조회 기간 준비')
    }
  }, [availabilityQuery.data])

  useEffect(() => {
    if (populationQuery.data) {
      recordPerformanceMilestone('첫 인구 데이터 준비')
    }
  }, [populationQuery.data])

  const populationMaximum = useMemo(
    () => Math.max(
      0,
      ...(populationQuery.data?.items.map((item) => item.population) ?? []),
    ),
    [populationQuery.data],
  )

  const facilitiesQuery = useQuery({
    queryKey: ['facilities', 'all'],
    queryFn: () => fetchFacilities(
      FACILITY_OPTIONS.map((option) => option.category),
    ),
    staleTime: 60 * 60 * 1000,
  })

  const visibleFacilityItems = useMemo(() => {
    const visible = new Set(visibleFacilityCategories)
    return facilitiesQuery.data?.items.filter(
      (item) => visible.has(item.category),
    ) ?? []
  }, [facilitiesQuery.data, visibleFacilityCategories])

  const facilityCountByCategory = useMemo(() => {
    const counts = new Map<FacilityCategory, number>()
    for (const item of facilitiesQuery.data?.items ?? []) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    }
    return counts
  }, [facilitiesQuery.data])

  const toggleFacilityCategory = (category: FacilityCategory) => {
    setVisibleFacilityCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    )
  }

  const toggleDevelopmentControls = () => {
    setOpenMapControl((current) =>
      toggleMapControlPopover(current, 'development'),
    )
  }

  const toggleFacilityControls = () => {
    setOpenMapControl((current) =>
      toggleMapControlPopover(current, 'facility'),
    )
  }

  const closeMapControlPopovers = () => {
    setOpenMapControl(null)
    // 지도를 만지면 검색 결과 안내는 할 일을 다 했으므로 닫습니다. 주소를 찾는 중일 때만 남깁니다.
    setAddressSearchFeedback((current) => (current?.status === 'loading' ? current : null))
  }

  useEffect(() => {
    if (addressSearchFeedback?.status !== 'success') return
    // 선택한 대상은 지도와 왼쪽 설명창에 이미 보이므로 성공 안내는 잠깐만 보여줍니다.
    const timer = window.setTimeout(() => {
      setAddressSearchFeedback((current) => (current === addressSearchFeedback ? null : current))
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [addressSearchFeedback])

  const facilityControlsOpen = openMapControl === 'facility'
  const developmentControlsOpen = openMapControl === 'development'
  const developmentPopoverOpen = developmentControlsOpen
  const facilityPopoverOpen = facilityControlsOpen
  const activeFacilityLayerCount = visibleFacilityCategories.length
    + Number(showMajorRoads)
    + Number(showRoadTraffic)

  useEffect(() => {
    const heading = mapHeadingRef.current
    if (!heading) return

    const observer = new ResizeObserver(([entry]) => {
      // 제목, 지도 버튼, 범례와 시설 버튼 전체를 한 줄에 표시하려면
      // 넓은 화면에서도 충분한 여유가 필요합니다.
      const compact = entry.contentRect.width < 1800
      setCompactFacilityControls(compact)
      if (!compact) {
        setOpenMapControl(null)
      }
    })
    observer.observe(heading)
    return () => observer.disconnect()
  }, [])

  const majorRoadsQuery = useQuery({
    queryKey: ['major-roads'],
    queryFn: loadMajorRoads,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const facilityToggleButtons = FACILITY_OPTIONS.map((option) => {
    const active = visibleFacilityCategories.includes(option.category)
    return (
      <button
        type="button"
        key={option.category}
        className={`facility-toggle facility-${option.category.toLowerCase()} ${active ? 'active' : ''}`}
        aria-pressed={active}
        aria-label={`${option.label} 레이어 ${active ? '끄기' : '켜기'}`}
        title={
          facilitiesQuery.isError
            ? '시설 정보를 불러오지 못했습니다.'
            : undefined
        }
        onClick={() => toggleFacilityCategory(option.category)}
      >
        <i aria-hidden="true" />
        {option.label}
        {facilitiesQuery.data && (
          <small>{facilityCountByCategory.get(option.category) ?? 0}</small>
        )}
        <span className="facility-toggle-state" aria-hidden="true">
          {active ? 'ON' : 'OFF'}
        </span>
      </button>
    )
  })

  const majorRoadsToggleButton = (
    <button
      type="button"
      className={`facility-toggle major-road-toggle ${showMajorRoads ? 'active' : ''}`}
      aria-pressed={showMajorRoads}
      aria-label={`주요 도로 레이어 ${showMajorRoads ? '끄기' : '켜기'}`}
      title={majorRoadsQuery.isError
        ? '주요 도로 자료를 불러오지 못했습니다.'
        : 'VWorld 도로중심선의 차로 수 6 이상 구간입니다.'}
      disabled={majorRoadsQuery.isError}
      onClick={() => setShowMajorRoads((visible) => !visible)}
    >
      <i aria-hidden="true" />
      주요 도로
      <span className="facility-toggle-state" aria-hidden="true">
        {showMajorRoads ? 'ON' : 'OFF'}
      </span>
    </button>
  )

  const roadTrafficToggleButton = (
    <button
      type="button"
      className={`facility-toggle road-traffic-toggle ${showRoadTraffic ? 'active' : ''}`}
      aria-pressed={showRoadTraffic}
      aria-label={`도로 혼잡도 ${showRoadTraffic ? '끄기' : '켜기'}`}
      title="NAVER 지도에서 제공하는 약 5분 주기의 도로 교통상황입니다."
      onClick={() => setShowRoadTraffic((visible) => !visible)}
    >
      <i aria-hidden="true" />
      도로 혼잡도
      <span className="facility-toggle-state" aria-hidden="true">
        {showRoadTraffic ? 'ON' : 'OFF'}
      </span>
    </button>
  )

  // 선택 지역이 있어야 의미 있는 상세 조회는 enabled 조건으로 요청을 늦춥니다.
  const similarDensityQuery = useQuery({
    queryKey: [
      'similar-density',
      selectedRegion?.code,
      effectiveYear,
      effectiveMonth,
    ],
    queryFn: () =>
      fetchSimilarDensity(
        selectedRegion?.code ?? '',
        effectiveYear,
        effectiveMonth,
      ),
    enabled: Boolean(
      // 전국 유사 지역 비교는 행정동용 자료입니다. 법정동 선택 때는 요청하지 않습니다.
      selectedRegion && boundaryType === 'administrative' && availableMonths.length,
    ),
  })

  const comparisonQuery = useQuery({
    queryKey: [
      'population-comparison',
      populationLevel,
      selectedRegion?.code,
      effectiveComparisonBaseYm,
      effectiveStatsYm,
    ],
    queryFn: () =>
      fetchPopulationComparison(
        populationLevel,
        selectedRegion?.code ?? '',
        effectiveComparisonBaseYm,
        effectiveStatsYm,
      ),
    enabled: Boolean(
      selectedRegion &&
        effectiveComparisonBaseYm &&
        effectiveComparisonBaseYm !== effectiveStatsYm,
    ),
  })

  const trendQuery = useQuery({
    queryKey: [
      'population-trend',
      populationLevel,
      selectedRegion?.code,
    ],
    queryFn: () =>
      fetchPopulationTrend(
        populationLevel,
        selectedRegion?.code ?? '',
      ),
    enabled: Boolean(selectedRegion),
    staleTime: 5 * 60 * 1000,
  })

  const administrativeBoundaryQuery = useQuery({
    queryKey: ['boundary-search', 'administrative'],
    queryFn: () => loadBoundary('administrative'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  const legalBoundaryQuery = useQuery({
    queryKey: ['boundary-search', 'legal'],
    queryFn: () => loadBoundary('legal'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  const administrativeExportRegions = useMemo(() => {
    const regions = new Map<string, string>()
    administrativeBoundaryQuery.data?.features.forEach((feature) => {
      const code = getRegionCode(feature.properties, 'administrative')
      if (code) regions.set(code, getRegionName(feature.properties, 'administrative'))
    })
    return Array.from(regions, ([code, name]) => ({ code, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
  }, [administrativeBoundaryQuery.data])

  const exportRegionOptions = useMemo(() => {
    if (boundaryType === 'administrative') return administrativeExportRegions
    const features = legalBoundaryQuery.data?.features
    const regions = new Map<string, string>()
    features?.forEach((feature) => {
      const code = getRegionCode(feature.properties, boundaryType)
      if (code) regions.set(code, getRegionName(feature.properties, boundaryType))
    })
    return Array.from(regions, ([code, name]) => ({ code, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
  }, [administrativeExportRegions, boundaryType, legalBoundaryQuery.data])

  const waterwaysQuery = useQuery({
    queryKey: ['waterways'],
    queryFn: loadWaterways,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const developmentAreasQuery = useQuery({
    // 도형 파일은 검색하거나 개발계획을 볼 때만 읽어 첫 화면의 부담을 줄입니다.
    queryKey: ['development-areas'],
    queryFn: loadDevelopmentAreas,
    enabled:
      searchTerm.trim().length > 0 ||
      developmentControlsOpen ||
      sidePanelView === 'development' ||
      showDevelopmentAreas,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const developmentNoticesQuery = useQuery({
    // 도형은 GeoJSON, 고시 목록은 API/DB에서 옵니다. 아래에서 두 자료를 연결합니다.
    queryKey: ['development-notices'],
    queryFn: fetchDevelopmentNotices,
    enabled:
      searchTerm.trim().length > 0 ||
      developmentControlsOpen ||
      sidePanelView === 'development' ||
      showDevelopmentAreas,
    staleTime: 5 * 60 * 1000,
  })

  const selectedDevelopmentAreas = useMemo(
    () => resolveSelectedDevelopmentAreas(
      selectedDevelopmentAreaIds,
      developmentAreasQuery.data,
      developmentNoticesQuery.data?.items ?? [],
    ),
    [
      selectedDevelopmentAreaIds,
      developmentAreasQuery.data,
      developmentNoticesQuery.data,
    ],
  )

  const developmentAreaMetadata = useMemo(() => {
    const metadata = new Map<
      GeoJsonFeature,
      ReturnType<typeof getDevelopmentAreaMetadata>
    >()
    const notices = developmentNoticesQuery.data?.items ?? []
    for (const feature of developmentAreasQuery.data?.features ?? []) {
      metadata.set(feature, getDevelopmentAreaMetadata(feature, notices))
    }
    return metadata
  }, [developmentAreasQuery.data, developmentNoticesQuery.data])

  const developmentYearOptions = useMemo(
    () =>
      Array.from(
        new Set(
          Array.from(developmentAreaMetadata.values())
            .map((metadata) => metadata.noticeYear)
            .filter((noticeYear): noticeYear is number => noticeYear !== null),
        ),
      ).sort((left, right) => right - left),
    [developmentAreaMetadata],
  )

  const filteredDevelopmentAreas = useMemo(() => {
    // 연도·종료 상태를 먼저 거른 뒤 지도에 넘겨야 화면과 클릭 대상이 일치합니다.
    const collection = developmentAreasQuery.data
    if (!collection) return undefined

    const features = collection.features
      .filter((feature) => {
        const metadata = developmentAreaMetadata.get(feature)
        const matchesYear =
          developmentYearFilter === 'all' ||
          (developmentYearFilter === 'unknown'
            ? metadata?.noticeYear === null
            : metadata?.noticeYear === Number(developmentYearFilter))
        const matchesStatus =
          !hideEndedDevelopmentAreas || !metadata?.isEnded
        return matchesYear && matchesStatus
      })
      // NAVER Data 레이어는 나중에 추가된 도형이 위에서 클릭됩니다.
      // 큰 구역부터 넣어 작은 구역을 마지막에 그립니다.
      .sort(
        (left, right) =>
          getDevelopmentFeatureArea(right) -
          getDevelopmentFeatureArea(left),
      )

    return { ...collection, features }
  }, [
    developmentAreaMetadata,
    developmentAreasQuery.data,
    developmentYearFilter,
    hideEndedDevelopmentAreas,
  ])

  const visibleDevelopmentAreaIds = useMemo(
    () => new Set(
      filteredDevelopmentAreas?.features.map((feature) =>
        String(feature.properties.areaSourceId ?? ''),
      ) ?? [],
    ),
    [filteredDevelopmentAreas],
  )

  const siteSearchResults = useMemo<SiteSearchResult[]>(() => {
    const query = normalizeSearchText(searchTerm)
    if (!query) return []

    const regionResults: SiteSearchResult[] = [
      ...((administrativeBoundaryQuery.data?.features ?? []).map((feature) => ({
        feature,
        boundaryType: 'administrative' as const,
      }))),
      ...((legalBoundaryQuery.data?.features ?? []).map((feature) => ({
        feature,
        boundaryType: 'legal' as const,
      }))),
    ]
      .map(({ feature, boundaryType: resultBoundaryType }) => {
        const name = getRegionName(feature.properties, resultBoundaryType)
        const score = getSearchScore(name, query)
        if (!Number.isFinite(score)) return null
        const code = getRegionCode(feature.properties, resultBoundaryType)
        return {
          id: `region-${resultBoundaryType}-${code}`,
          type: 'region' as const,
          title: name.replace(/^경상남도\s+김해시\s*/, ''),
          subtitle: resultBoundaryType === 'administrative' ? '행정동' : '법정동',
          score,
          region: { name, code, type: resultBoundaryType },
        }
      })
      .filter((result): result is Extract<SiteSearchResult, { type: 'region' }> => result !== null)
      .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, 'ko'))
      .slice(0, 4)

    const notices = developmentNoticesQuery.data?.items ?? []
    const developmentResults: SiteSearchResult[] = (
      developmentAreasQuery.data?.features ?? []
    )
      .map((feature) => {
        const selection = createDevelopmentSelection(feature, notices)
        const searchableText = [
          selection.name,
          selection.categoryLabel,
          ...selection.notices.map((notice) => notice.title),
        ].join(' ')
        const score = getSearchScore(searchableText, query)
        if (!Number.isFinite(score)) return null
        return {
          id: `development-${selection.sourceId || selection.name}`,
          type: 'development' as const,
          title: selection.name,
          subtitle: selection.categoryLabel,
          score,
          feature,
          selection,
        }
      })
      .filter((result): result is Extract<SiteSearchResult, { type: 'development' }> => result !== null)
      .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, 'ko'))
      .slice(0, 4)

    const facilityResults: SiteSearchResult[] = (
      facilitiesQuery.data?.items ?? []
    )
      .map((facility) => {
        const score = getSearchScore(
          `${facility.name} ${facility.roadAddress ?? ''} ${facility.parcelAddress ?? ''}`,
          query,
        )
        if (!Number.isFinite(score)) return null
        return {
          id: `facility-${facility.id}`,
          type: 'facility' as const,
          title: facility.name,
          subtitle:
            FACILITY_OPTIONS.find((option) => option.category === facility.category)?.label ??
            '주요 시설',
          score,
          facility,
        }
      })
      .filter((result): result is Extract<SiteSearchResult, { type: 'facility' }> => result !== null)
      .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, 'ko'))
      .slice(0, 4)

    return [...regionResults, ...developmentResults, ...facilityResults].sort(
      (left, right) => left.score - right.score,
    )
  }, [
    administrativeBoundaryQuery.data,
    developmentAreasQuery.data,
    developmentNoticesQuery.data,
    facilitiesQuery.data,
    legalBoundaryQuery.data,
    searchTerm,
  ])

  const clearAddressSearch = () => {
    setSearchTerm('')
    setAddressSearchRequest(null)
    setAddressSearchFeedback(null)
  }

  const selectSiteSearchResult = (result: SiteSearchResult) => {
    addressSearchSequenceRef.current += 1
    const requestId = addressSearchSequenceRef.current
    setSearchFocused(false)

    if (result.type === 'region') {
      setBoundaryType(result.region.type)
      selectRegion(result.region)
      setAddressSearchRequest(null)
      setAddressSearchFeedback({
        status: 'success',
        title: result.title,
        subtitle: result.subtitle,
      })
      return
    }

    if (result.type === 'facility') {
      const facility = result.facility
      setSelectedFacility(facility)
      setSidePanelView('facility')
      setIsSidePanelCollapsed(false)
      setOpenMapControl(null)
      setVisibleFacilityCategories((current) =>
        current.includes(facility.category)
          ? current
          : [...current, facility.category],
      )
      setAddressSearchFeedback({
        status: 'success',
        title: facility.name,
        subtitle: facility.roadAddress || facility.parcelAddress || result.subtitle,
      })
      setAddressSearchRequest({
        id: requestId,
        kind: 'coordinate',
        query: facility.name,
        latitude: facility.latitude,
        longitude: facility.longitude,
        zoom: 17,
      })
      return
    }

    setSelectedDevelopmentAreaIds([result.selection.sourceId])
    setSidePanelView('development')
    setIsSidePanelCollapsed(false)
    setOpenMapControl(null)
    setShowDevelopmentAreas(true)
    setDevelopmentYearFilter('all')
    setHideEndedDevelopmentAreas(false)
    setAddressSearchFeedback({
      status: 'success',
      title: result.selection.name,
      subtitle: result.selection.categoryLabel,
    })
    const center = getFeatureCenter(result.feature)
    setAddressSearchRequest(center ? {
      id: requestId,
      kind: 'coordinate',
      query: result.selection.name,
      latitude: center.latitude,
      longitude: center.longitude,
      zoom: 15,
    } : null)
  }

  const submitAddressSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchTerm.trim()
    if (!query) return

    const firstSiteResult = siteSearchResults[0]
    if (firstSiteResult) {
      selectSiteSearchResult(firstSiteResult)
      return
    }

    addressSearchSequenceRef.current += 1
    const requestId = addressSearchSequenceRef.current
    setSearchFocused(false)
    setAddressSearchFeedback({ status: 'loading' })
    setAddressSearchRequest({
      id: requestId,
      kind: 'address',
      query: query.includes('김해시') ? query : `경상남도 김해시 ${query}`,
    })
  }

  const selectedStats = selectedRegion
    ? populationQuery.data?.items.find(
        (item) => item.regionCode === selectedRegion.code,
      )
    : undefined

  const selectedBoundaryFeature = useMemo(() => {
    const boundaryData = boundaryType === 'administrative'
      ? administrativeBoundaryQuery.data
      : legalBoundaryQuery.data
    if (!selectedRegion || !boundaryData) return undefined
    return boundaryData.features.find(
      (feature) =>
        getRegionCode(feature.properties, boundaryType) ===
        selectedRegion.code,
    )
  }, [
    administrativeBoundaryQuery.data,
    boundaryType,
    legalBoundaryQuery.data,
    selectedRegion,
  ])

  const deferredSelectedBoundaryFeature = useDeferredValue(
    selectedBoundaryFeature,
  )
  const spatialAnalysisPending =
    selectedBoundaryFeature !== deferredSelectedBoundaryFeature

  const selectedFacilityCounts = useMemo(
    () =>
      countFacilitiesByCategory(
        facilitiesQuery.data?.items ?? [],
        deferredSelectedBoundaryFeature,
      ),
    [deferredSelectedBoundaryFeature, facilitiesQuery.data],
  )

  const selectedWaterwayCount = useMemo(() => {
    if (!deferredSelectedBoundaryFeature || !waterwaysQuery.data) return null
    return waterwaysQuery.data.features.filter((feature) =>
      featuresIntersect(deferredSelectedBoundaryFeature, feature),
    ).length
  }, [deferredSelectedBoundaryFeature, waterwaysQuery.data])

  const selectedLivingFacilityCount =
    (selectedFacilityCounts.get('HOSPITAL') ?? 0) +
    (selectedFacilityCounts.get('SCHOOL') ?? 0) +
    (selectedFacilityCounts.get('UNIVERSITY') ?? 0) +
    (selectedFacilityCounts.get('MARKET') ?? 0) +
    (selectedFacilityCounts.get('PARK') ?? 0)

  const similarDensityComparison = similarDensityQuery.data?.comparison
  const similarDensityAverage =
    similarDensityComparison?.averageDensityPerKm2 ?? null
  const densityMultiple =
    similarDensityComparison?.targetToAverageRatio ?? null
  const densityDifferenceWidth = densityMultiple === null
    ? 0
    : Math.min(Math.abs(densityMultiple - 1), 0.5) * 100
  const densityDirection =
    densityMultiple !== null && densityMultiple >= 1
      ? 'higher'
      : 'lower'
  const comparisonRate = comparisonQuery.data?.changeRate ?? null
  const comparisonRateWidth = comparisonRate === null
    ? 0
    : Math.min(Math.abs(comparisonRate), 10) * 5
  const comparisonRateDirection =
    comparisonRate !== null && comparisonRate >= 0 ? 'positive' : 'negative'

  const boundaryLabel =
    boundaryType === 'administrative' ? '행정동' : '법정동'

  return (
    <main
      className={`dashboard-page ${isSidePanelCollapsed ? 'side-panel-collapsed' : ''}`}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === 'grid-template-columns'
        ) {
          window.dispatchEvent(new Event('resize'))
        }
      }}
    >
      <nav className="dashboard-service-rail" aria-label="지도 서비스 메뉴">
        <a className="dashboard-rail-brand" href="#map-area" aria-label="김해 생활지도">
          G
        </a>
        <div className="dashboard-rail-menu">
          <a href="#map-area">
            <DashboardRailIcon name="map" />
            지도
          </a>
          <a
            className={sidePanelView === 'region' ? 'active' : ''}
            href="#region-detail"
            onClick={() => {
              setSidePanelView('region')
              setIsSidePanelCollapsed(false)
            }}
          >
            <DashboardRailIcon name="detail" />
            지역 정보
          </a>
          <div
            className={`rail-status-item ${sidePanelView === 'development' ? 'active' : ''}`}
            aria-current={sidePanelView === 'development' ? 'true' : undefined}
            title="지도에서 개발구역 경계를 선택하면 자동으로 열립니다."
          >
            <DashboardRailIcon name="development" />
            개발계획
          </div>
          <div
            className={`rail-status-item ${sidePanelView === 'facility' ? 'active' : ''}`}
            aria-current={sidePanelView === 'facility' ? 'true' : undefined}
            title="지도에서 시설 마커를 선택하면 자동으로 열립니다."
          >
            <DashboardRailIcon name="facility" />
            주요 시설
          </div>
        </div>
        <button
          type="button"
          className="dashboard-guide-trigger dashboard-guide-rail"
          onClick={openWelcomeGuide}
        >
          <span aria-hidden="true">?</span>
          사용 안내
        </button>
        <div className="dashboard-rail-caption">GIMHAE GIS</div>
      </nav>

      <section className="filter-card" id="dashboard-filters" aria-label="조회 조건">
        <div className="boundary-filter">
          <span className="filter-label">지역 구분</span>
          <div className="boundary-tabs" aria-label="지역 구분 선택">
            <button
              type="button"
              aria-pressed={boundaryType === 'administrative'}
              className={boundaryType === 'administrative' ? 'active' : ''}
              onClick={() => {
                setBoundaryType('administrative')
                setSelectedRegion(null)
                setPairComparison(null)
                clearAddressSearch()
              }}
            >
              행정동
            </button>

            <button
              type="button"
              aria-pressed={boundaryType === 'legal'}
              className={boundaryType === 'legal' ? 'active' : ''}
              onClick={() => {
                setBoundaryType('legal')
                setSelectedRegion(null)
                setPairComparison(null)
                clearAddressSearch()
              }}
            >
              법정동
            </button>
          </div>
        </div>

        <label className="filter-field">
          <span>연도</span>
          <select
            value={effectiveYear}
            onChange={(event) => setSelectedStatsYm(selectPopulationMonthInYear(
              availabilityItems,
              populationLevel,
              Number(event.target.value),
              effectiveMonth,
            ))}
            disabled={availabilityQuery.isLoading || !availableYears.length}
          >
            {availableYears.map((optionYear) => (
              <option key={optionYear} value={optionYear}>
                {optionYear}년
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>월</span>
          <select
            value={effectiveMonth}
            onChange={(event) => setSelectedStatsYm(
              `${effectiveYear}${event.target.value.padStart(2, '0')}`,
            )}
            disabled={
              availabilityQuery.isLoading || !availableMonthsInYear.length
            }
          >
            {availableMonthsInYear.map((optionMonth) => (
              <option key={optionMonth} value={optionMonth}>
                {optionMonth}월{availabilityItems.find(
                  (item) => item.statsYm === `${effectiveYear}${String(optionMonth).padStart(2, '0')}`,
                )?.complete === false ? ' (일부)' : ''}
              </option>
            ))}
          </select>
        </label>

        <PopulationCsvExport
          level={populationLevel}
          regionCode={selectedRegion?.code ?? ''}
          regionOptions={exportRegionOptions}
          administrativeRegions={administrativeExportRegions}
          statsYm={effectiveStatsYm}
          availableMonths={availableMonths}
        />

        {populationQuery.isFetching && (
          <span className="query-status loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            인구 데이터 조회 중
          </span>
        )}
        {populationQuery.isError && (
          <span className="query-status error" role="alert">
            {populationQuery.error.message}
          </span>
        )}
        {availabilityQuery.isError && (
          <span className="query-status error" role="alert">
            조회 가능한 기간을 확인하지 못했습니다.
          </span>
        )}
        {availabilityQuery.data && !availableMonths.length && (
          <span className="query-status error" role="status">
            저장된 {boundaryLabel} 인구 데이터가 없습니다.
          </span>
        )}
        {populationQuery.data && !populationQuery.isFetching && (
          populationQuery.data.meta.dataAvailable === false ? (
            <span className="query-status error" role="status">
              선택한 기간의 데이터가 없습니다. 먼저 데이터를 동기화해 주세요.
            </span>
          ) : selectedMonthAvailability &&
            populationQuery.data.count < selectedMonthAvailability.expectedRegionCount ? (
            <span className="query-status warning" role="status">
              일부 적재: {populationQuery.data.count}/{selectedMonthAvailability.expectedRegionCount}곳 ·{' '}
              {selectedMonthAvailability.expectedRegionCount - populationQuery.data.count}곳 누락
            </span>
          ) : (
            <span className="query-status success">
              {boundaryLabel} {populationQuery.data.count}곳 조회 완료
            </span>
          )
        )}

        <form
          className="region-search"
          onSubmit={submitAddressSearch}
          onFocus={() => setSearchFocused(true)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            setSearchFocused(false)
            setAddressSearchFeedback(null)
            if (event.target instanceof HTMLElement) event.target.blur()
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setSearchFocused(false)
            }
          }}
        >
          <label className="search-field-label" htmlFor="region-search">
            주소 검색
          </label>
          <div className="search-input-wrap">
            <input
              id="region-search"
              type="search"
              value={searchTerm}
              placeholder="지역·개발계획·주요 시설 검색"
              autoComplete="off"
              onChange={(event) => {
                setSearchTerm(event.target.value)
                setAddressSearchFeedback(null)
              }}
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear"
                aria-label="주소 검색어 지우기"
                onClick={clearAddressSearch}
              >
                ×
              </button>
            )}
            <button
              type="submit"
              className="address-search-submit"
              aria-label="주소 검색"
              disabled={!searchTerm.trim() || addressSearchFeedback?.status === 'loading'}
            >
              <DashboardRailIcon name="search" />
            </button>
          </div>

          {searchFocused && searchTerm.trim() && (
            <div className="search-results site-search-preview" role="listbox" aria-label="통합검색 미리보기">
              {siteSearchResults.length > 0 ? (
                siteSearchResults.map((result) => (
                  <button
                    type="button"
                    className={`search-result site-search-result ${result.type}`}
                    key={result.id}
                    role="option"
                    aria-selected="false"
                    onClick={() => selectSiteSearchResult(result)}
                  >
                    <span className="site-search-result-main">
                      <strong>{result.title}</strong>
                      {result.type === 'facility' && (
                        <small>
                          {result.facility.roadAddress || result.facility.parcelAddress || '김해시 주요 시설'}
                        </small>
                      )}
                      {result.type === 'development' && result.selection.notices[0] && (
                        <small>{result.selection.notices[0].title}</small>
                      )}
                    </span>
                    <span className="site-search-result-type">{result.subtitle}</span>
                  </button>
                ))
              ) : developmentAreasQuery.isLoading || facilitiesQuery.isLoading ? (
                <div className="search-result-empty inline-loading-state" role="status">
                  <span className="loading-spinner" aria-hidden="true" />
                  검색 자료를 불러오는 중입니다.
                </div>
              ) : (
                <div className="search-result-empty">
                  사이트 내부 결과가 없습니다. Enter를 누르면 주소로 찾습니다.
                </div>
              )}
            </div>
          )}

          {!searchFocused && addressSearchFeedback && (
            <div className={`search-results address-search-feedback ${addressSearchFeedback.status}`}>
              {addressSearchFeedback.status === 'loading' ? (
                <div className="search-result-empty inline-loading-state" role="status">
                  <span className="loading-spinner" aria-hidden="true" />
                  주소를 찾는 중입니다.
                </div>
              ) : addressSearchFeedback.status === 'success' ? (
                <div className="address-search-match" role="status">
                  <strong>
                    {addressSearchFeedback.title ||
                      addressSearchFeedback.roadAddress ||
                      addressSearchFeedback.jibunAddress}
                  </strong>
                  {(addressSearchFeedback.subtitle ||
                    (addressSearchFeedback.roadAddress && addressSearchFeedback.jibunAddress
                      ? addressSearchFeedback.jibunAddress
                      : undefined)) && (
                    <span>
                      {addressSearchFeedback.subtitle || addressSearchFeedback.jibunAddress}
                    </span>
                  )}
                </div>
              ) : addressSearchFeedback.status === 'outside' ? (
                <div className="search-result-empty" role="alert">
                  김해시 안의 주소만 검색할 수 있습니다.
                </div>
              ) : addressSearchFeedback.status === 'empty' ? (
                <div className="search-result-empty" role="alert">
                  일치하는 주소나 시설이 없습니다.
                </div>
              ) : (
                <div className="search-result-empty" role="alert">
                  주소 검색을 불러오지 못했습니다.
                </div>
              )}
            </div>
          )}
        </form>
        <button
          type="button"
          className="dashboard-guide-trigger dashboard-guide-mobile"
          onClick={openWelcomeGuide}
        >
          <span aria-hidden="true">?</span>
          사용 안내
        </button>
      </section>

      <section className="dashboard-grid">
        <div className="map-card" id="map-area">
          <button
            type="button"
            className="side-panel-toggle"
            aria-label={isSidePanelCollapsed ? '왼쪽 정보 패널 펼치기' : '왼쪽 정보 패널 접기'}
            aria-expanded={!isSidePanelCollapsed}
            aria-controls="dashboard-filters region-detail"
            title={isSidePanelCollapsed ? '정보 패널 펼치기' : '정보 패널 접기'}
            onClick={() => setIsSidePanelCollapsed((current) => !current)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d={isSidePanelCollapsed ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'} />
            </svg>
          </button>
          <div className="card-heading" id="map-layers" ref={mapHeadingRef}>
            <div>
              <h2>{boundaryLabel} 인구 분포</h2>
            </div>

            <div className="map-heading-tools" id="map-settings">
              <div className="map-settings-group-label" aria-hidden="true">
                <DashboardRailIcon name="layers" />
                <span>지도 설정</span>
              </div>
              <div className="map-quick-controls" role="group" aria-label="빠른 지도 레이어">
                <button
                  type="button"
                  className={`boundary-fill-toggle ${showBoundaryFill && !showRoadTraffic ? 'active' : ''}`}
                  aria-pressed={showBoundaryFill && !showRoadTraffic}
                  title={
                    showRoadTraffic
                      ? '도로 교통상황을 보는 동안 인구 색상은 잠시 숨깁니다.'
                      : showBoundaryFill
                      ? '색상 필터를 끄고 경계선만 표시'
                      : '인구에 따른 색상 필터 표시'
                  }
                  disabled={showRoadTraffic}
                  onClick={() => setShowBoundaryFill((visible) => !visible)}
                >
                  <i aria-hidden="true" />
                  색상 필터
                  <span className="map-quick-indicator" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`waterway-layer-toggle ${showWaterways ? 'active' : ''}`}
                  aria-pressed={showWaterways}
                  title={showWaterways ? '하천망 숨기기' : '하천망 표시'}
                  disabled={waterwaysQuery.isError}
                  onClick={() => setShowWaterways((visible) => !visible)}
                >
                  <i aria-hidden="true" />
                  하천망
                  <span className="map-quick-indicator" aria-hidden="true" />
                </button>
              </div>
              <div className="map-menu-controls" role="group" aria-label="상세 지도 레이어 설정">
              <div className="development-layer-control">
                <button
                  type="button"
                  className={`development-layer-toggle ${showDevelopmentAreas ? 'active' : ''} ${developmentControlsOpen ? 'open' : ''}`}
                  aria-expanded={developmentControlsOpen}
                  aria-haspopup="dialog"
                  aria-controls="development-filter-menu"
                  title="개발계획 표시와 필터 설정"
                  disabled={developmentAreasQuery.isError}
                  onClick={toggleDevelopmentControls}
                >
                  <i aria-hidden="true" />
                  개발계획
                  {showDevelopmentAreas && (
                    <span className="map-menu-state">ON</span>
                  )}
                  <span className="map-menu-chevron" aria-hidden="true" />
                </button>
                {developmentPopoverOpen && (
                  <div
                    id="development-filter-menu"
                    className="facility-popover development-filter-popover"
                    role="dialog"
                    aria-label="개발계획 지도 필터"
                  >
                    <div className="facility-popover-heading">
                      <strong>개발계획 레이어</strong>
                    </div>
                    <div className="development-compact-panel">
                      {(developmentAreasQuery.isLoading ||
                        developmentNoticesQuery.isLoading) && (
                        <div className="layer-loading-state" role="status">
                          <span className="loading-spinner" aria-hidden="true" />
                          개발구역과 고시정보를 불러오는 중입니다.
                        </div>
                      )}
                      <button
                        type="button"
                        className={`facility-toggle development-compact-toggle ${showDevelopmentAreas ? 'active' : ''}`}
                        aria-pressed={showDevelopmentAreas}
                        onClick={() =>
                          setShowDevelopmentAreas((visible) => !visible)
                        }
                      >
                        <i aria-hidden="true" />
                        개발구역
                        <span className="facility-toggle-state" aria-hidden="true">
                          {showDevelopmentAreas ? 'ON' : 'OFF'}
                        </span>
                      </button>
                      <div className="development-compact-options">
                        <label className="development-compact-year">
                          <span>고시연도</span>
                          <select
                            value={developmentYearFilter}
                            onChange={(event) =>
                              setDevelopmentYearFilter(event.target.value)
                            }
                          >
                            <option value="all">전체 연도</option>
                            <option value="unknown">연도 미확인</option>
                            {developmentYearOptions.map((noticeYear) => (
                              <option key={noticeYear} value={noticeYear}>
                                {noticeYear}년
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className={`facility-toggle development-compact-ended ${hideEndedDevelopmentAreas ? 'active' : ''}`}
                          aria-pressed={hideEndedDevelopmentAreas}
                          onClick={() =>
                            setHideEndedDevelopmentAreas((hidden) => !hidden)
                          }
                        >
                          <i aria-hidden="true" />
                          종료 구역 숨기기
                          <span className="facility-toggle-state" aria-hidden="true">
                            {hideEndedDevelopmentAreas ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="facility-layer-control">
                {compactFacilityControls ? (
                  <>
                    <button
                      type="button"
                      className={`facility-menu-toggle ${facilityControlsOpen ? 'open' : ''} ${visibleFacilityCategories.length || showMajorRoads || showRoadTraffic ? 'active' : ''}`}
                      aria-expanded={facilityControlsOpen}
                      aria-haspopup="dialog"
                      aria-controls="facility-layer-menu"
                      onClick={toggleFacilityControls}
                    >
                      <span>주요 시설</span>
                      <small className="map-menu-count">{activeFacilityLayerCount}개</small>
                      <span className="map-menu-chevron" aria-hidden="true" />
                    </button>
                    {facilityPopoverOpen && (
                      <div
                        id="facility-layer-menu"
                        className="facility-popover"
                        role="dialog"
                        aria-label="주요 시설 지도 필터"
                      >
                        <div className="facility-popover-heading">
                          <strong>시설 레이어</strong>
                        </div>
                        {facilitiesQuery.isLoading && (
                          <div className="layer-loading-state" role="status">
                            <span className="loading-spinner" aria-hidden="true" />
                            시설 정보를 불러오는 중입니다.
                          </div>
                        )}
                        <div
                          className="facility-toggles"
                          aria-label="지도 시설 종류 선택"
                        >
                          {facilityToggleButtons}
                          {majorRoadsToggleButton}
                          {roadTrafficToggleButton}
                        </div>
                        <p className="road-traffic-note">
                          주요 도로는 VWorld 도로중심선에서 6차로 이상인 구간입니다. 도로 혼잡도를 켜는 동안에는 인구 색상만 숨깁니다.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className="facility-toggles"
                    aria-label="지도 시설 종류 선택"
                  >
                    {facilityToggleButtons}
                    {majorRoadsToggleButton}
                    {roadTrafficToggleButton}
                  </div>
                )}
              </div>
              </div>
              {populationMaximum > 0 && (
                <div
                  className="map-legend"
                  aria-label={`인구수 색상 범례, 0명부터 ${populationMaximum.toLocaleString()}명까지 최대값 대비 5단계`}
                >
                  <small>인구수</small>
                  <div className="legend-scale-wrap">
                    <i className="legend-scale" aria-hidden="true" />
                    <div aria-hidden="true">
                      <span>0</span>
                      <span>{formatLegendPopulation(Math.round(populationMaximum / 2))}</span>
                      <span>{formatLegendPopulation(populationMaximum)}명</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <NaverMap
            boundaryType={boundaryType}
            selectedRegion={selectedRegion}
            comparedRegionCode={ENABLE_TWO_REGION_COMPARISON && pairComparison?.type === boundaryType
              ? pairComparison.secondCode ?? undefined
              : undefined}
            onSelectRegion={selectRegion}
            onSelectDevelopmentAreas={(sourceIds) => {
              setSelectedDevelopmentAreaIds(sourceIds)
              setSidePanelView('development')
              setIsSidePanelCollapsed(false)
              setOpenMapControl(null)
            }}
            onSelectFacility={(facility) => {
              setSelectedFacility(facility)
              setSidePanelView('facility')
              setIsSidePanelCollapsed(false)
              setOpenMapControl(null)
            }}
            addressSearchRequest={addressSearchRequest}
            onAddressSearchResult={setAddressSearchFeedback}
            onMapInteraction={closeMapControlPopovers}
            populationItems={populationQuery.data?.items}
            facilityItems={visibleFacilityItems}
            showBoundaryFill={showBoundaryFill}
            waterways={waterwaysQuery.data}
            showWaterways={showWaterways}
            majorRoads={majorRoadsQuery.data}
            showMajorRoads={showMajorRoads}
            showRoadTraffic={showRoadTraffic}
            developmentAreas={developmentAreasQuery.data}
            visibleDevelopmentAreaIds={visibleDevelopmentAreaIds}
            showDevelopmentAreas={showDevelopmentAreas}
            developmentNotices={developmentNoticesQuery.data?.items}
          />
        </div>

        <aside className="detail-card" id="region-detail" aria-live="polite">
          {sidePanelView === 'development' ? (
            <section
              className={`side-layer-panel description-only ${selectedDevelopmentAreas.length ? 'has-selection' : ''}`}
              id="development-sidebar-panel"
              aria-labelledby="development-sidebar-title"
            >
              <div className="detail-heading side-layer-heading">
                <div>
                  <h2 id="development-sidebar-title">
                    {selectedDevelopmentAreas.length === 1
                      ? selectedDevelopmentAreas[0].name
                      : '개발계획'}
                  </h2>
                </div>
              </div>
              <div className="detail-region-meta side-description-meta">
                <span>
                  <small>경계 자료</small>
                  <strong>VWorld</strong>
                </span>
                <span>
                  <small>고시 연결</small>
                  <strong>공식 원문</strong>
                </span>
              </div>
              {selectedDevelopmentAreas.length === 1 && selectedDevelopmentAreas[0].imageUrl && (
                <figure className="selection-photo">
                  <img
                    src={selectedDevelopmentAreas[0].imageUrl}
                    alt={`${selectedDevelopmentAreas[0].name} 공식 사진`}
                    referrerPolicy="no-referrer"
                  />
                  <figcaption>
                    {selectedDevelopmentAreas[0].imageSourceUrl ? (
                      <a href={selectedDevelopmentAreas[0].imageSourceUrl} target="_blank" rel="noreferrer">
                        {selectedDevelopmentAreas[0].imageSourceName || '사진 출처 보기'}
                      </a>
                    ) : selectedDevelopmentAreas[0].imageSourceName || '공식 제공 사진'}
                  </figcaption>
                </figure>
              )}
              <div className="layer-description-list">
                {selectedDevelopmentAreas.map((area) => (
                  <article className="selected-map-description" key={area.sourceId || `${area.category}-${area.name}`}>
                    <small>{area.categoryLabel}</small>
                    {selectedDevelopmentAreas.length > 1 && <strong>{area.name}</strong>}
                    <p>{area.stageLabel}</p>
                    <div className="selected-development-notices">
                      {!developmentNoticesQuery.data && developmentNoticesQuery.isPending ? (
                        <span className="description-empty-notice" role="status">
                          관련 고시를 불러오는 중입니다.
                        </span>
                      ) : !developmentNoticesQuery.data && developmentNoticesQuery.isError ? (
                        <span className="description-empty-notice" role="alert">
                          관련 고시를 불러오지 못했습니다.
                        </span>
                      ) : area.notices.some((notice) => notice.sourceUrl) ? (
                        area.notices.filter((notice) => notice.sourceUrl).map((notice) => (
                          <a
                            href={notice.sourceUrl}
                            key={notice.id}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span>{notice.noticeDate} · {notice.noticeNumber}</span>
                            <strong>{notice.title}</strong>
                            <small>{notice.officialLinkStatusLabel}</small>
                          </a>
                        ))
                      ) : (
                        <span className="description-empty-notice">
                          연결이 확인된 공식 고시 원문이 없습니다.
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <div className="side-development-legend" aria-label="개발계획 색상 안내">
                <strong>지도 색상</strong>
                <span><i className="industrial" />산업단지</span>
                <span><i className="district" />지구단위계획</span>
                <span><i className="public" />공공개발</span>
                <span><i className="promotion" />개발진흥지구</span>
              </div>
            </section>
          ) : sidePanelView === 'facility' ? (
            <section
              className={`side-layer-panel description-only ${selectedFacility ? 'has-selection' : ''}`}
              id="facility-sidebar-panel"
              aria-labelledby="facility-sidebar-title"
            >
              <div className="detail-heading side-layer-heading">
                <div>
                  <h2 id="facility-sidebar-title">
                    {selectedFacility?.name ?? '주요 시설'}
                  </h2>
                </div>
              </div>
              <div className="detail-region-meta side-description-meta">
                <span>
                  <small>시설 분류</small>
                  <strong>
                    {selectedFacility
                      ? FACILITY_OPTIONS.find((option) => option.category === selectedFacility.category)?.label ?? '주요 시설'
                      : '생활·교통'}
                  </strong>
                </span>
                <span>
                  <small>지도 자료</small>
                  <strong>{selectedFacility?.source === 'VWORLD' || !selectedFacility ? 'VWorld' : selectedFacility.source}</strong>
                </span>
              </div>
              {selectedFacility && (
                <NaverRoadview
                  key={selectedFacility.id}
                  latitude={selectedFacility.latitude}
                  longitude={selectedFacility.longitude}
                  placeName={selectedFacility.name}
                  address={selectedFacility.roadAddress || selectedFacility.parcelAddress}
                />
              )}
              {selectedFacility?.imageUrl && (
                <figure className="selection-photo">
                  <img
                    src={selectedFacility.imageUrl}
                    alt={`${selectedFacility.name} 공식 사진`}
                    referrerPolicy="no-referrer"
                  />
                  <figcaption>
                    {selectedFacility.imageSourceUrl ? (
                      <a href={selectedFacility.imageSourceUrl} target="_blank" rel="noreferrer">
                        {selectedFacility.imageSourceName || '사진 출처 보기'}
                      </a>
                    ) : selectedFacility.imageSourceName || '공식 제공 사진'}
                  </figcaption>
                </figure>
              )}
              <div className="layer-description-list">
                {selectedFacility && (
                  <article className="selected-map-description facility-contact-description">
                    <dl className="selected-facility-details">
                      <div>
                        <dt>주소</dt>
                        <dd>{selectedFacility.roadAddress || selectedFacility.parcelAddress || '주소 정보 없음'}</dd>
                      </div>
                      {selectedFacility.phone && (
                        <div>
                          <dt>전화</dt>
                          <dd>{selectedFacility.phone}</dd>
                        </div>
                      )}
                    </dl>
                  </article>
                )}
              </div>
            </section>
          ) : (
            <div className="region-detail-content">
          <div className="detail-heading">
            <div>
              <h2
                key={selectedRegion?.code ?? 'empty'}
                className="detail-heading-title"
              >
                {selectedRegion?.name ?? '지역 상세'}
              </h2>
            </div>
            {selectedRegion && (
              <span className="detail-period">
                {effectiveYear}.{String(effectiveMonth).padStart(2, '0')}
              </span>
            )}
          </div>

          {selectedRegion ? (
            <div className="selected-region">
              <div className="detail-region-meta">
                <span>
                  <small>지역 구분</small>
                  <strong>
                    {selectedRegion.type === 'administrative'
                      ? '행정동'
                      : '법정동'}
                  </strong>
                </span>
                <span>
                  <small>지역 코드</small>
                  <strong>{selectedRegion.code || '확인 필요'}</strong>
                </span>
              </div>

              {selectedStats ? (
                <>
                  <div className="detail-tabs" role="tablist" aria-label="선택 지역 정보 보기">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={detailTab === 'summary'}
                      className={detailTab === 'summary' ? 'active' : ''}
                      onClick={() => setDetailTab('summary')}
                    >
                      요약
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={detailTab === 'change'}
                      className={detailTab === 'change' ? 'active' : ''}
                      onClick={() => setDetailTab('change')}
                    >
                      인구 변화
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={detailTab === 'age'}
                      className={detailTab === 'age' ? 'active' : ''}
                      onClick={() => setDetailTab('age')}
                    >
                      연령 구성
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={detailTab === 'ranking'}
                      className={detailTab === 'ranking' ? 'active' : ''}
                      onClick={() => setDetailTab('ranking')}
                    >
                      지역 비교
                    </button>
                  </div>

                  {detailTab === 'summary' && (
                    <div
                      className="detail-tab-panel summary-tab-panel"
                      role="tabpanel"
                    >
                      <section
                        className="summary-section"
                        aria-labelledby="population-summary-title"
                      >
                        <div className="section-title">
                          <div>
                            <h3 id="population-summary-title">
                              인구와 세대
                            </h3>
                          </div>
                          <span>조회월 기준</span>
                        </div>
                        <dl className="summary-metric-list">
                          <div>
                            <dt>총인구</dt>
                            <dd>{selectedStats.population.toLocaleString()}명</dd>
                          </div>
                          <div>
                            <dt>세대 수</dt>
                            <dd>{selectedStats.households.toLocaleString()}세대</dd>
                          </div>
                          <div>
                            <dt>세대당 인구</dt>
                            <dd>
                              {selectedStats.populationPerHousehold.toFixed(2)}명
                            </dd>
                          </div>
                          <div>
                            <dt>전월 대비</dt>
                            <dd>
                              {formatChange(
                                selectedStats.comparisons.previousMonth.change,
                                selectedStats.comparisons.previousMonth.changeRate,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>전년 동월 대비</dt>
                            <dd>
                              {formatChange(
                                selectedStats.comparisons.previousYear.change,
                                selectedStats.comparisons.previousYear.changeRate,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>면적 · 인구밀도</dt>
                            <dd>
                              {selectedStats.areaKm2.toFixed(2)}㎢ ·{' '}
                              {selectedStats.populationDensity.toLocaleString()}명/㎢
                            </dd>
                          </div>
                        </dl>
                        {ENABLE_TWO_REGION_COMPARISON && <button
                          type="button"
                          className="two-region-start"
                          onClick={() => {
                            setPairComparison({
                              type: boundaryType,
                              firstCode: selectedRegion.code,
                              secondCode: null,
                              pickingSecond: true,
                            })
                            setDetailTab('ranking')
                          }}
                        >
                          이 동을 다른 동과 비교하기
                        </button>}
                      </section>

                      <section
                        className="reorganization-analysis"
                        aria-labelledby="reorganization-analysis-title"
                      >
                        <div className="section-title">
                          <div>
                            <small>지역 안 시설</small>
                            <h3 id="reorganization-analysis-title">
                              경계와 생활권
                            </h3>
                          </div>
                          <span>선택한 지역 안에서 집계</span>
                        </div>
                        <div className="reorganization-indicator-grid">
                          <article className="natural-barrier">
                            <span aria-hidden="true">≈</span>
                            <small>하천망 구역</small>
                            <strong>
                              {spatialAnalysisPending || selectedWaterwayCount === null
                                ? '확인 중'
                                : `${selectedWaterwayCount}개`}
                            </strong>
                          </article>
                          <article className="connection-point">
                            <span aria-hidden="true">↔</span>
                            <small>교량</small>
                            <strong>
                              {spatialAnalysisPending
                                ? '확인 중'
                                : `${selectedFacilityCounts.get('BRIDGE') ?? 0}개`}
                            </strong>
                          </article>
                          <article className="mobility-point">
                            <span aria-hidden="true">●</span>
                            <small>교통거점</small>
                            <strong>
                              {spatialAnalysisPending
                                ? '확인 중'
                                : `${selectedFacilityCounts.get('TRANSIT') ?? 0}개`}
                            </strong>
                          </article>
                          <article className="living-point">
                            <span aria-hidden="true">＋</span>
                            <small>생활 주요 시설</small>
                            <strong>
                              {spatialAnalysisPending
                                ? '확인 중'
                                : `${selectedLivingFacilityCount}개`}
                            </strong>
                          </article>
                        </div>
                      </section>
                    </div>
                  )}

                  {detailTab === 'change' && (
                    <div className="detail-tab-panel" role="tabpanel">
                  <div className="manual-comparison">
                    <div className="section-title">
                      <div>
                        <small>기준월 비교</small>
                        <h3>
                          {effectiveComparisonBaseYm
                            ? `${effectiveComparisonBaseYm.slice(0, 4)}년 ${Number(effectiveComparisonBaseYm.slice(4))}월 대비`
                            : '비교할 이전 월이 없습니다'}
                        </h3>
                      </div>
                      <div className="comparison-heading-control">
                        <select
                          value={effectiveComparisonBaseYm}
                          onChange={(event) =>
                            setComparisonBaseYm(event.target.value)
                          }
                          aria-label="기준월 선택"
                          disabled={
                            availabilityQuery.isLoading ||
                            availableMonths.length < 2
                          }
                        >
                          {!effectiveComparisonBaseYm && (
                            <option value="">기준월 선택</option>
                          )}
                          {availableMonths
                            .filter((statsYm) => statsYm !== effectiveStatsYm)
                            .slice()
                            .reverse()
                            .map((statsYm) => (
                              <option key={statsYm} value={statsYm}>
                                {statsYm.slice(0, 4)}년{' '}
                                {Number(statsYm.slice(4))}월
                                {availabilityItems.find((item) => item.statsYm === statsYm)?.complete === false
                                  ? ' (일부)'
                                  : ''}
                              </option>
                            ))}
                        </select>
                        {comparisonQuery.isFetching && (
                          <span className="inline-loading-state">
                            <span className="loading-spinner" aria-hidden="true" />
                            계산 중
                          </span>
                        )}
                      </div>
                    </div>
                    {comparisonBaseAvailability && !comparisonBaseAvailability.complete && (
                      <p className="comparison-data-warning" role="status">
                        기준월 자료 일부 적재: {comparisonBaseAvailability.storedRegionCount}/
                        {comparisonBaseAvailability.expectedRegionCount}곳 ·{' '}
                        {Math.max(comparisonBaseAvailability.expectedRegionCount - comparisonBaseAvailability.storedRegionCount, 0)}곳 누락
                      </p>
                    )}
                    {comparisonQuery.isError ? (
                      <p className="comparison-empty" role="alert">
                        기준월 비교 데이터를 불러오지 못했습니다.
                      </p>
                    ) : comparisonQuery.data ? (
                      <div className="comparison-grid manual-comparison-grid">
                        <div>
                          <small>기준월 인구</small>
                          <strong>
                            {comparisonQuery.data.base
                              ? `${comparisonQuery.data.base.population.toLocaleString()}명`
                              : '데이터 없음'}
                          </strong>
                        </div>
                        <div>
                          <small>조회월 인구</small>
                          <strong>
                            {comparisonQuery.data.target
                              ? `${comparisonQuery.data.target.population.toLocaleString()}명`
                              : '데이터 없음'}
                          </strong>
                        </div>
                        <div>
                          <small>증감</small>
                          <strong>
                            {formatChange(
                              comparisonQuery.data.change,
                              comparisonQuery.data.changeRate,
                            )}
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <p className="comparison-empty">
                        이 지역은 기준월과 비교할 데이터가 없습니다.
                      </p>
                    )}
                  </div>

                  <div className="visual-summary" aria-label="핵심 지표 시각화">
                    <div className="visual-metric">
                      <div className="visual-metric-heading">
                        <span>기준월 대비 증감률</span>
                        <strong>
                          {comparisonRate === null
                            ? '비교 데이터 없음'
                            : `${comparisonRate > 0 ? '+' : ''}${comparisonRate.toFixed(2)}%`}
                        </strong>
                      </div>
                      <div
                        className="delta-meter"
                        role="progressbar"
                        aria-label="기준월 대비 증감률"
                        aria-valuemin={0}
                        aria-valuemax={10}
                        aria-valuenow={
                          comparisonRate === null
                            ? 0
                            : Math.min(Math.abs(comparisonRate), 10)
                        }
                        aria-valuetext={
                          comparisonRate === null
                            ? '비교 데이터 없음'
                            : `${comparisonRate.toFixed(2)}퍼센트`
                        }
                      >
                        <span className="delta-meter-center" aria-hidden="true" />
                        <span
                          className={`delta-meter-fill ${comparisonRateDirection}`}
                          style={{ width: `${comparisonRateWidth}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <small>왼쪽 감소 · 오른쪽 증가 · ±10% 기준</small>
                    </div>

                    <div className="visual-metric">
                      <div className="visual-metric-heading">
                        <span>면적 유사 지역 대비 인구밀도</span>
                        <strong>
                          {boundaryType !== 'administrative'
                            ? '행정동 전용'
                            : similarDensityQuery.isLoading
                              ? '계산 중...'
                              : densityMultiple === null
                                ? '비교 데이터 없음'
                                : `${densityMultiple.toFixed(2)}배`}
                        </strong>
                      </div>
                      <div
                        className="density-comparison-meter"
                        role="meter"
                        aria-label="면적 유사 지역 평균 대비 인구밀도 배수"
                        aria-valuemin={0.5}
                        aria-valuemax={1.5}
                        aria-valuenow={densityMultiple ?? undefined}
                        aria-valuetext={
                          densityMultiple === null
                            ? '비교 데이터 없음'
                            : `${densityMultiple.toFixed(2)}배`
                        }
                      >
                        <span
                          className="density-meter-center"
                          aria-hidden="true"
                        />
                        <span
                          className={`density-comparison-fill ${densityDirection}`}
                          style={{ width: `${densityDifferenceWidth}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="density-meter-axis" aria-hidden="true">
                        <span>0.5배 이하</span>
                        <strong>1.0배</strong>
                        <span>1.5배 이상</span>
                      </div>
                      <small>
                        {boundaryType !== 'administrative'
                          ? '면적이 비슷한 지역 비교는 행정동 화면에서 볼 수 있습니다.'
                          : similarDensityQuery.isError
                            ? '면적 유사 지역 비교를 불러오지 못했습니다.'
                            : similarDensityAverage === null
                              ? '전국 행정동 인구 데이터를 동기화하면 비교값이 나옵니다.'
                              : `면적 ±10% 지역 ${similarDensityComparison?.sampleCount ?? 0}곳 평균 ${similarDensityAverage.toLocaleString()}명/㎢`}
                      </small>
                    </div>
                  </div>

                  <p className="area-note">
                    ※ 면적은 GeoJSON 경계로 계산해 공식 면적과 약 ±1㎢ 차이 날 수 있습니다.
                  </p>

                  <div className="trend-section">
                    <div className="section-title">
                      <div>
                        <small>장기 변화</small>
                        <h3>월별 인구 추이</h3>
                      </div>
                      {trendQuery.isFetching && (
                        <span className="inline-loading-state">
                          <span className="loading-spinner" aria-hidden="true" />
                          불러오는 중
                        </span>
                      )}
                    </div>
                    {trendQuery.isError ? (
                      <p className="comparison-empty" role="alert">
                        장기 인구 추이를 불러오지 못했습니다.
                      </p>
                    ) : trendQuery.data ? (
                      <PopulationTrendChart
                        data={trendQuery.data}
                      />
                    ) : (
                      <div className="chart-empty inline-loading-state">
                        <span className="loading-spinner" aria-hidden="true" />
                        장기 인구 데이터를 불러오는 중입니다.
                      </div>
                    )}
                  </div>
                    </div>
                  )}

                  {detailTab === 'age' && (
                    <div className="detail-tab-panel" role="tabpanel">
                  <div className="age-section">
                    <div className="section-title">
                      <div>
                        <small>연령대별 분포</small>
                        <h3>10세 단위 인구 분포</h3>
                      </div>
                      <span>막대 길이: 인구 수</span>
                    </div>
                    <AgeDistributionChart
                      items={selectedStats.ageDistribution}
                    />
                  </div>
                    </div>
                  )}

                  {detailTab === 'ranking' && (
                    <div className="detail-tab-panel ranking-tab-panel" role="tabpanel">
                      {ENABLE_TWO_REGION_COMPARISON && <TwoRegionComparison
                        items={populationQuery.data?.items ?? []}
                        levelLabel={boundaryLabel}
                        statsYm={effectiveStatsYm}
                        firstCode={pairComparison?.firstCode ?? selectedRegion.code}
                        secondCode={pairComparison?.secondCode ?? null}
                        pickingSecond={pairComparison?.pickingSecond ?? false}
                        onChooseSecond={(code) => setPairComparison({
                          type: boundaryType,
                          firstCode: pairComparison?.firstCode ?? selectedRegion.code,
                          secondCode: code || null,
                          pickingSecond: false,
                        })}
                        onPickOnMap={() => setPairComparison({
                          type: boundaryType,
                          firstCode: pairComparison?.firstCode ?? selectedRegion.code,
                          secondCode: pairComparison?.secondCode ?? null,
                          pickingSecond: !(pairComparison?.pickingSecond ?? false),
                        })}
                        onClear={() => setPairComparison(null)}
                      />}
                      <RegionComparisonTable
                        items={populationQuery.data?.items ?? []}
                        levelLabel={boundaryLabel}
                        selectedRegionCode={selectedRegion.code}
                        onSelectRegion={(item) => {
                          const region = {
                            name: item.regionName,
                            code: item.regionCode,
                            type: boundaryType,
                          }
                          if (pairComparison?.pickingSecond) {
                            selectRegion(region)
                          } else {
                            setPairComparison(null)
                            setSelectedRegion(region)
                          }
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="detail-help">
                  {populationQuery.isLoading
                    ? '인구 데이터를 불러오는 중입니다.'
                    : populationQuery.data?.meta.dataAvailable === false
                      ? '선택한 기간의 데이터가 아직 없습니다.'
                      : '선택한 지역의 통계가 없습니다.'}
                </p>
              )}
            </div>
          ) : (
            <div className="empty-detail">
              <img
                className="empty-icon-image"
                src={mapIcon}
                alt="김해시 캐릭터"
              />
              <strong>지도에서 지역을 선택하세요</strong>
            </div>
          )}
            </div>
          )}
        </aside>
      </section>

      {isWelcomeGuideOpen && <WelcomeGuide onClose={closeWelcomeGuide} />}

    </main>
  )
}
