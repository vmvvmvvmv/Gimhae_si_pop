import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AgeDistributionChart from '../components/common/AgeDistributionChart'
import PopulationTrendChart from '../components/common/PopulationTrendChart'
import RegionComparisonTable from '../components/common/RegionComparisonTable'
import NaverMap from '../components/map/NaverMap'
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
  FACILITY_OPTIONS,
  fetchFacilities,
  type FacilityCategory,
} from '../features/facilities/facilityApi'
import mapIcon from '../assets/map_icon.png'
import { fetchDevelopmentNotices } from '../features/development/developmentApi'
import {
  getDevelopmentAreaMetadata,
  getDevelopmentFeatureArea,
} from '../features/development/developmentMatching'
import './DashboardPage.css'
import '../styles/handdrawn-dashboard.css'

interface SelectedRegion {
  name: string
  code: string
  type: BoundaryType
}

type SearchRegion = SelectedRegion
type DetailTab = 'summary' | 'change' | 'age'

function formatChange(change: number | null, changeRate: number | null) {
  if (change === null || changeRate === null) {
    return '비교 데이터 없음'
  }

  const sign = change > 0 ? '+' : ''
  return (
    sign +
    change.toLocaleString() +
    '명 (' +
    sign +
    changeRate.toFixed(2) +
    '%)'
  )
}

export default function DashboardPage() {
  const mapHeadingRef = useRef<HTMLDivElement>(null)
  const [boundaryType, setBoundaryType] =
    useState<BoundaryType>('administrative')
  const [selectedRegion, setSelectedRegion] =
    useState<SelectedRegion | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('summary')
  const [year, setYear] = useState(2025)
  const [month, setMonth] = useState(12)
  const [comparisonBaseYm, setComparisonBaseYm] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [visibleFacilityCategories, setVisibleFacilityCategories] = useState<
    FacilityCategory[]
  >(['ADMIN_CENTER', 'HOSPITAL', 'TRANSIT', 'BRIDGE'])
  const [compactFacilityControls, setCompactFacilityControls] = useState(true)
  const [facilityControlsOpen, setFacilityControlsOpen] = useState(false)
  const [developmentControlsOpen, setDevelopmentControlsOpen] = useState(false)
  const [showBoundaryFill, setShowBoundaryFill] = useState(true)
  const [showWaterways, setShowWaterways] = useState(true)
  const [showMajorRoads, setShowMajorRoads] = useState(true)
  const [showRoadTraffic, setShowRoadTraffic] = useState(false)
  const [showDevelopmentAreas, setShowDevelopmentAreas] = useState(false)
  const [developmentYearFilter, setDevelopmentYearFilter] = useState('all')
  const [hideEndedDevelopmentAreas, setHideEndedDevelopmentAreas] =
    useState(false)

  const selectRegion = (region: SelectedRegion) => {
    setDetailTab('summary')
    setSelectedRegion(region)
  }

  const populationLevel =
    boundaryType === 'administrative' ? 'admin' : 'legal'

  const availabilityQuery = useQuery({
    queryKey: ['population-availability'],
    queryFn: fetchPopulationAvailability,
    staleTime: 60_000,
  })

  const availableMonths = useMemo(() => {
    return availabilityQuery.data?.levels[populationLevel]?.months ?? []
  }, [availabilityQuery.data, populationLevel])

  const availableYears = useMemo(() => {
    return Array.from(
      new Set(availableMonths.map((statsYm) => Number(statsYm.slice(0, 4)))),
    ).sort((left, right) => right - left)
  }, [availableMonths])

  const effectiveStatsYm = useMemo(() => {
    const currentStatsYm = `${year}${String(month).padStart(2, '0')}`
    return availableMonths.includes(currentStatsYm)
      ? currentStatsYm
      : availableMonths[availableMonths.length - 1] ?? currentStatsYm
  }, [availableMonths, month, year])

  const effectiveYear = Number(effectiveStatsYm.slice(0, 4))
  const effectiveMonth = Number(effectiveStatsYm.slice(4))

  const effectiveComparisonBaseYm = useMemo(() => {
    const previousYearYm = `${effectiveYear - 1}${String(effectiveMonth).padStart(2, '0')}`
    if (
      comparisonBaseYm &&
      availableMonths.includes(comparisonBaseYm) &&
      comparisonBaseYm !== effectiveStatsYm
    ) {
      return comparisonBaseYm
    }
    if (availableMonths.includes(previousYearYm)) {
      return previousYearYm
    }
    return availableMonths.find((statsYm) => statsYm !== effectiveStatsYm) ?? ''
  }, [
    availableMonths,
    comparisonBaseYm,
    effectiveMonth,
    effectiveStatsYm,
    effectiveYear,
  ])

  const availableMonthsInYear = useMemo(() => {
    return availableMonths
      .filter((statsYm) => Number(statsYm.slice(0, 4)) === effectiveYear)
      .map((statsYm) => Number(statsYm.slice(4)))
  }, [availableMonths, effectiveYear])

  const populationQuery = useQuery({
    queryKey: ['population', populationLevel, effectiveYear, effectiveMonth],
    queryFn: () =>
      fetchPopulation(populationLevel, effectiveYear, effectiveMonth),
  })

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

  useEffect(() => {
    const heading = mapHeadingRef.current
    if (!heading) return

    const observer = new ResizeObserver(([entry]) => {
      // 제목, 색상·하천 버튼, 범례까지 포함하면 시설 버튼 전체를
      // 도로 교통상황 버튼까지 한 줄에 표시하려면 여유 공간이 더 필요합니다.
      const compact = entry.contentRect.width < 1800
      setCompactFacilityControls(compact)
      if (!compact) {
        setFacilityControlsOpen(false)
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

  const roadTrafficToggleButton = (
    <button
      type="button"
      className={`facility-toggle road-traffic-toggle ${showRoadTraffic ? 'active' : ''}`}
      aria-pressed={showRoadTraffic}
      aria-label={`도로 교통상황 레이어 ${showRoadTraffic ? '끄기' : '켜기'}`}
      title="네이버 지도에서 제공하는 현재 도로 교통상황입니다. 켜면 인구 색상은 잠시 숨깁니다."
      onClick={() => setShowRoadTraffic((visible) => !visible)}
    >
      <i aria-hidden="true" />
      도로 교통상황
      <span className="facility-toggle-state" aria-hidden="true">
        {showRoadTraffic ? 'ON' : 'OFF'}
      </span>
    </button>
  )

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
      selectedRegion && boundaryType === 'administrative',
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

  const boundaryQuery = useQuery({
    queryKey: ['boundary-search', boundaryType],
    queryFn: () => loadBoundary(boundaryType),
  })

  const waterwaysQuery = useQuery({
    queryKey: ['waterways'],
    queryFn: loadWaterways,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const developmentAreasQuery = useQuery({
    queryKey: ['development-areas'],
    queryFn: loadDevelopmentAreas,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const developmentNoticesQuery = useQuery({
    queryKey: ['development-notices'],
    queryFn: fetchDevelopmentNotices,
    staleTime: 5 * 60 * 1000,
  })

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

  const hiddenDevelopmentAreaCount =
    (developmentAreasQuery.data?.features.length ?? 0) -
    (filteredDevelopmentAreas?.features.length ?? 0)
  const totalDevelopmentAreaCount =
    developmentAreasQuery.data?.features.length ?? 0
  const developmentFiltersActive =
    developmentYearFilter !== 'all' || hideEndedDevelopmentAreas

  const searchResults = useMemo<SearchRegion[]>(() => {
    const normalizedTerm = searchTerm.trim().toLocaleLowerCase()

    if (!normalizedTerm || !boundaryQuery.data) {
      return []
    }

    return boundaryQuery.data.features
      .map((feature) => ({
        name: getRegionName(feature.properties, boundaryType),
        code: getRegionCode(feature.properties, boundaryType),
        type: boundaryType,
      }))
      .filter((region) =>
        region.name.toLocaleLowerCase().includes(normalizedTerm),
      )
      .slice(0, 8)
  }, [boundaryQuery.data, boundaryType, searchTerm])

  const selectedStats = selectedRegion
    ? populationQuery.data?.items.find(
        (item) => item.regionCode === selectedRegion.code,
      )
    : undefined

  const selectedBoundaryFeature = useMemo(() => {
    if (!selectedRegion || !boundaryQuery.data) return undefined
    return boundaryQuery.data.features.find(
      (feature) =>
        getRegionCode(feature.properties, boundaryType) ===
        selectedRegion.code,
    )
  }, [boundaryQuery.data, boundaryType, selectedRegion])

  const selectedFacilityCounts = useMemo(
    () =>
      countFacilitiesByCategory(
        facilitiesQuery.data?.items ?? [],
        selectedBoundaryFeature,
      ),
    [facilitiesQuery.data, selectedBoundaryFeature],
  )

  const selectedWaterwayCount = useMemo(() => {
    if (!selectedBoundaryFeature || !waterwaysQuery.data) return null
    return waterwaysQuery.data.features.filter((feature) =>
      featuresIntersect(selectedBoundaryFeature, feature),
    ).length
  }, [selectedBoundaryFeature, waterwaysQuery.data])

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
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="header-copy">
          <h1>인구 지도</h1>
        </div>

        <div className="boundary-switch" aria-label="지역 구분 선택">
            <button
              type="button"
              aria-pressed={boundaryType === 'administrative'}
              className={boundaryType === 'administrative' ? 'active' : ''}
              onClick={() => {
                setBoundaryType('administrative')
                setSelectedRegion(null)
                setSearchTerm('')
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
                setSearchTerm('')
              }}
            >
              법정동
            </button>
        </div>
      </header>

      <section className="filter-card" aria-label="조회 조건">
        <div className="region-search">
          <label className="search-field-label" htmlFor="region-search">
            지역 검색
          </label>
          <div className="search-input-wrap">
            <input
              id="region-search"
              type="search"
              value={searchTerm}
              placeholder="예: 진영, 장유, 내외동"
              autoComplete="off"
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear"
                aria-label="검색어 지우기"
                onClick={() => setSearchTerm('')}
              >
                ×
              </button>
            )}
          </div>

          {searchTerm && (
            <div className="search-results">
              {boundaryQuery.isLoading ? (
                <div className="search-result-empty">지역 목록을 불러오는 중입니다.</div>
              ) : searchResults.length ? (
                searchResults.map((region) => (
                  <button
                    type="button"
                    className="search-result"
                    key={region.code}
                    onClick={() => {
                      selectRegion(region)
                      setSearchTerm('')
                    }}
                  >
                    <strong>{region.name}</strong>
                    <span>{region.type === 'administrative' ? '행정동' : '법정동'}</span>
                  </button>
                ))
              ) : (
                <div className="search-result-empty">
                  일치하는 지역이 없습니다.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="filter-summary">
          <span className="filter-label">조회 기준</span>
          <strong>{effectiveYear}년 {effectiveMonth}월</strong>
        </div>

        <label className="filter-field">
          <span>연도</span>
          <select
            value={effectiveYear}
            onChange={(event) => setYear(Number(event.target.value))}
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
            onChange={(event) => setMonth(Number(event.target.value))}
            disabled={
              availabilityQuery.isLoading || !availableMonthsInYear.length
            }
          >
            {availableMonthsInYear.map((optionMonth) => (
              <option key={optionMonth} value={optionMonth}>
                {optionMonth}월
              </option>
            ))}
          </select>
        </label>

        {populationQuery.isFetching && (
          <span className="query-status">인구 데이터 조회 중...</span>
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
        {populationQuery.data && !populationQuery.isFetching && (
          populationQuery.data.meta.dataAvailable === false ? (
            <span className="query-status error" role="status">
              해당 연월 데이터가 없습니다. 동기화가 필요합니다.
            </span>
          ) : (
            <span className="query-status success">
              {boundaryLabel} {populationQuery.data.count}곳 조회 완료
            </span>
          )
        )}
      </section>

      <section className="dashboard-grid">
        <div className="map-card">
          <div className="card-heading" ref={mapHeadingRef}>
            <div>
              <span>지역 경계</span>
              <h2>{boundaryLabel} 인구 분포</h2>
            </div>

            <div className="map-heading-tools">
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
                <span aria-hidden="true">{showWaterways ? 'ON' : 'OFF'}</span>
              </button>
              <div className="development-layer-control">
                <button
                  type="button"
                  className={`development-layer-toggle ${showDevelopmentAreas ? 'active' : ''} ${developmentControlsOpen ? 'open' : ''}`}
                  aria-expanded={developmentControlsOpen}
                  aria-controls="development-filter-menu"
                  title="개발계획 표시와 필터 설정"
                  disabled={developmentAreasQuery.isError}
                  onClick={() =>
                    setDevelopmentControlsOpen((open) => !open)
                  }
                >
                  <i aria-hidden="true" />
                  개발계획
                  <span aria-hidden="true">
                    {showDevelopmentAreas
                      ? `${filteredDevelopmentAreas?.features.length ?? 0}개`
                      : 'OFF'}
                  </span>
                </button>
                {developmentControlsOpen && (
                  <div
                    id="development-filter-menu"
                    className="facility-popover development-filter-popover"
                    role="dialog"
                    aria-label="개발계획 지도 필터"
                  >
                    <div className="development-filter-heading">
                      <div>
                        <small>VWorld 공식 지정구역</small>
                        <strong>개발계획 지도 필터</strong>
                      </div>
                      <button
                        type="button"
                        className="development-filter-close"
                        aria-label="개발계획 필터 닫기"
                        onClick={() => setDevelopmentControlsOpen(false)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="development-filter-panel">
                      <button
                        type="button"
                        className={`development-layer-switch ${showDevelopmentAreas ? 'active' : ''}`}
                        aria-pressed={showDevelopmentAreas}
                        onClick={() =>
                          setShowDevelopmentAreas((visible) => !visible)
                        }
                      >
                        <span className="development-filter-symbol" aria-hidden="true">
                          <i />
                        </span>
                        <span className="development-filter-option-copy">
                          <strong>지도에 개발구역 표시</strong>
                          <small>지정·고시 구역의 위치와 경계를 표시합니다.</small>
                        </span>
                        <span className="development-switch" aria-hidden="true">
                          <i />
                        </span>
                      </button>
                      <div className="development-filter-options">
                        <label className="development-year-field">
                          <span>최근 연결 고시연도</span>
                          <small>구역에 연결된 가장 최근 고시 기준</small>
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
                          className={`development-ended-toggle ${hideEndedDevelopmentAreas ? 'active' : ''}`}
                          aria-pressed={hideEndedDevelopmentAreas}
                          onClick={() =>
                            setHideEndedDevelopmentAreas((hidden) => !hidden)
                          }
                        >
                          <span className="development-filter-option-copy">
                            <strong>종료 구역 숨기기</strong>
                            <small>해제·취소·준공이 확인된 구역 제외</small>
                          </span>
                          <span className="development-switch" aria-hidden="true">
                            <i />
                          </span>
                        </button>
                      </div>
                      <div className="development-filter-footer">
                        <div className="development-filter-result">
                          <strong>
                            {filteredDevelopmentAreas?.features.length.toLocaleString() ?? 0}
                          </strong>
                          <span>
                            / {totalDevelopmentAreaCount.toLocaleString()}개 표시
                            {hiddenDevelopmentAreaCount > 0
                              ? ` · ${hiddenDevelopmentAreaCount.toLocaleString()}개 제외`
                              : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="development-filter-reset"
                          disabled={!developmentFiltersActive}
                          onClick={() => {
                            setDevelopmentYearFilter('all')
                            setHideEndedDevelopmentAreas(false)
                          }}
                        >
                          필터 초기화
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
                      className={`facility-menu-toggle ${facilityControlsOpen ? 'open' : ''}`}
                      aria-expanded={facilityControlsOpen}
                      aria-controls="facility-layer-menu"
                      onClick={() => setFacilityControlsOpen((open) => !open)}
                    >
                      <span>주요 시설</span>
                      <small>
                        {visibleFacilityCategories.length + Number(showMajorRoads) + Number(showRoadTraffic)}개 켜짐
                      </small>
                    </button>
                    {facilityControlsOpen && (
                      <div
                        id="facility-layer-menu"
                        className="facility-popover"
                      >
                        <div className="facility-popover-heading">
                          <strong>시설 레이어</strong>
                          <span>표시할 시설을 선택하세요</span>
                        </div>
                        <div
                          className="facility-toggles"
                          aria-label="지도 시설 종류 선택"
                        >
                          {facilityToggleButtons}
                          {majorRoadsToggleButton}
                          {roadTrafficToggleButton}
                        </div>
                        <p className="road-traffic-note">
                          주요 도로는 VWorld 도로중심선의 차로 수 6 이상 구간입니다. 인구 색상을 가리지 않고 표시합니다.
                        </p>
                        <p className="road-traffic-note">
                          켜면 인구 색상은 잠시 숨기고 경계선은 유지합니다. 도로 색상은 현재 교통상황이며 주민 동선은 아닙니다.
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
              {boundaryType === 'administrative' && (
                <div className="map-legend" aria-label="인구수 색상 범례">
                  <span>적음</span>
                  <i className="legend-scale" aria-hidden="true" />
                  <span>많음</span>
                </div>
              )}
            </div>
          </div>

          <NaverMap
            boundaryType={boundaryType}
            onSelectRegion={selectRegion}
            populationItems={populationQuery.data?.items}
            facilityItems={visibleFacilityItems}
            showBoundaryFill={showBoundaryFill}
            waterways={waterwaysQuery.data}
            showWaterways={showWaterways}
            majorRoads={majorRoadsQuery.data}
            showMajorRoads={showMajorRoads}
            showRoadTraffic={showRoadTraffic}
            developmentAreas={filteredDevelopmentAreas}
            showDevelopmentAreas={showDevelopmentAreas}
            developmentNotices={developmentNoticesQuery.data?.items}
          />
        </div>

        <aside className="detail-card" aria-live="polite">
          <div className="detail-heading">
            <div>
              <span>선택 지역</span>
              <h2>{selectedRegion?.name ?? '지역 상세'}</h2>
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
                  </div>

                  {detailTab === 'summary' && (
                    <div className="detail-tab-panel" role="tabpanel">
                  <div className="stat-grid">
                    <div>
                      <small>총인구</small>
                      <strong>
                        {selectedStats.population.toLocaleString()}명
                      </strong>
                    </div>
                    <div>
                      <small>세대 수</small>
                      <strong>
                        {selectedStats.households.toLocaleString()}세대
                      </strong>
                    </div>
                    <div>
                      <small>세대당 인구</small>
                      <strong>
                        {selectedStats.populationPerHousehold.toFixed(2)}명
                      </strong>
                    </div>
                  </div>

                  <div className="comparison-grid">
                    <div>
                      <small>전월 대비</small>
                      <strong>
                        {formatChange(
                          selectedStats.comparisons.previousMonth.change,
                          selectedStats.comparisons.previousMonth.changeRate,
                        )}
                      </strong>
                    </div>
                    <div>
                      <small>전년 동월 대비</small>
                      <strong>
                        {formatChange(
                          selectedStats.comparisons.previousYear.change,
                          selectedStats.comparisons.previousYear.changeRate,
                        )}
                      </strong>
                    </div>
                    <div>
                      <small>면적 · 인구밀도</small>
                      <strong>
                        {selectedStats.areaKm2.toFixed(2)}㎢ ·{' '}
                        {selectedStats.populationDensity.toLocaleString()}명/㎢
                      </strong>
                    </div>
                  </div>

                  <section
                    className="reorganization-analysis"
                    aria-labelledby="reorganization-analysis-title"
                  >
                    <div className="reorganization-analysis-heading">
                      <div>
                        <small>행정구역 개편 참고</small>
                        <h3 id="reorganization-analysis-title">
                          경계와 생활권 연결 지표
                        </h3>
                      </div>
                      <span>선택 지역 내부 기준</span>
                    </div>
                    <div className="reorganization-indicator-grid">
                      <article className="natural-barrier">
                        <span aria-hidden="true">≈</span>
                        <small>하천망 구역</small>
                        <strong>
                          {selectedWaterwayCount === null
                            ? '확인 중'
                            : `${selectedWaterwayCount}개`}
                        </strong>
                      </article>
                      <article className="connection-point">
                        <span aria-hidden="true">↔</span>
                        <small>교량</small>
                        <strong>
                          {selectedFacilityCounts.get('BRIDGE') ?? 0}개
                        </strong>
                      </article>
                      <article className="mobility-point">
                        <span aria-hidden="true">●</span>
                        <small>교통거점</small>
                        <strong>
                          {selectedFacilityCounts.get('TRANSIT') ?? 0}개
                        </strong>
                      </article>
                      <article className="living-point">
                        <span aria-hidden="true">＋</span>
                        <small>생활 주요 시설</small>
                        <strong>{selectedLivingFacilityCount}개</strong>
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
                          {effectiveComparisonBaseYm.slice(0, 4)}년{' '}
                          {Number(effectiveComparisonBaseYm.slice(4))}월 대비
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
                          {availableMonths
                            .filter((statsYm) => statsYm !== effectiveStatsYm)
                            .slice()
                            .reverse()
                            .map((statsYm) => (
                              <option key={statsYm} value={statsYm}>
                                {statsYm.slice(0, 4)}년{' '}
                                {Number(statsYm.slice(4))}월
                              </option>
                            ))}
                        </select>
                        {comparisonQuery.isFetching && <span>계산 중...</span>}
                      </div>
                    </div>
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
                        지도에서 지역을 선택하면 기준월과 비교합니다.
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
                          ? '전국 행정동 면적 비교는 행정동 화면에서 제공됩니다.'
                          : similarDensityQuery.isError
                            ? '면적 유사 지역 비교를 불러오지 못했습니다.'
                            : similarDensityAverage === null
                              ? '전국 행정동별 인구 데이터를 동기화하면 비교됩니다.'
                              : `면적 ±10% 지역 ${similarDensityComparison?.sampleCount ?? 0}곳 평균 ${similarDensityAverage.toLocaleString()}명/㎢`}
                      </small>
                    </div>
                  </div>

                  <p className="area-note">
                    ※ GeoJSON 경계 기반 계산 면적으로 실제 공식 면적과 약 ±1㎢ 차이가 날 수 있습니다.
                  </p>

                  <div className="trend-section">
                    <div className="section-title">
                      <div>
                        <small>장기 변화</small>
                        <h3>월별 인구 추이</h3>
                      </div>
                      {trendQuery.isFetching && <span>불러오는 중...</span>}
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
                      <div className="chart-empty">
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
                      <span>막대는 인구 수</span>
                    </div>
                    <AgeDistributionChart
                      items={selectedStats.ageDistribution}
                    />
                  </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="detail-help">
                  {populationQuery.isLoading
                    ? '인구 데이터를 불러오는 중입니다.'
                    : populationQuery.data?.meta.dataAvailable === false
                      ? '해당 연월 데이터가 아직 저장되지 않았습니다.'
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
              <p>지역을 클릭하면 상세 정보가 표시됩니다.</p>
            </div>
          )}
        </aside>
      </section>

      {populationQuery.data?.items.length ? (
        <RegionComparisonTable
          items={populationQuery.data.items}
          levelLabel={boundaryLabel}
        />
      ) : null}

    </main>
  )
}
