import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import AgeDistributionChart from '../components/common/AgeDistributionChart'
import RegionComparisonTable from '../components/common/RegionComparisonTable'
import PopulationCsvExport from '../components/common/PopulationCsvExport'
import TwoRegionComparison from '../components/common/TwoRegionComparison'
import NaverMap, {
  type AddressSearchRequest,
  type AddressSearchResult,
} from '../components/map/NaverMap'
import MapErrorBoundary from '../components/map/MapErrorBoundary'
import type { BoundaryType } from '../features/boundaries/boundaryLoader'
import { selectPopulationMonthInYear } from '../features/population/availabilitySelection'
import type { FacilityCategory, FacilityItem } from '../features/facilities/facilityApi'
import mapIcon from '../assets/map_icon.png'
import AccountMenu from './dashboard/AccountMenu'
import DashboardRail, { type SidePanelView } from './dashboard/DashboardRail'
import { DashboardRailIcon } from './dashboard/DashboardRailIcon'
import DevelopmentSidePanel from './dashboard/DevelopmentSidePanel'
import FacilitySidePanel from './dashboard/FacilitySidePanel'
import GisDataLink from './dashboard/GisDataLink'
import MapLayerToolbar from './dashboard/MapLayerToolbar'
import RegionChangeTab from './dashboard/RegionChangeTab'
import RegionSummaryTab from './dashboard/RegionSummaryTab'
import LockedStats from './dashboard/LockedStats'
import { useAccessState } from '../features/auth/useSession'
import { requestLogin } from '../lib/authRedirect'
import { BoundaryFilter, PeriodFilters } from './dashboard/DashboardFilters'
import { getFeatureCenter } from './dashboard/dashboardFormat'
import { buildSiteSearchResults, type SiteSearchResult } from './dashboard/siteSearch'
import {
  useDevelopmentLayers,
  useFacilityData,
  useMapOverlayData,
  usePopulationPeriod,
  useRegionBoundaries,
  useRegionDetailQueries,
  useSelectedRegionSpatial,
  type SelectedRegion,
} from './dashboard/useDashboardData'
import {
  toggleMapControlPopover,
  type MapControlPopover,
} from '../features/map/mapPresentation'
import './DashboardPage.css'

interface RegionPairComparison {
  type: BoundaryType
  firstCode: string
  secondCode: string | null
  pickingSecond: boolean
}

// 두 동 비교는 임시 비활성화. 다시 사용할 때 true로 변경합니다.
const ENABLE_TWO_REGION_COMPARISON = false

type DetailTab = 'summary' | 'change' | 'age' | 'ranking'

export default function DashboardPage() {
  // 이 페이지가 지도·조회 조건·선택 지역·상세 패널의 공통 상태를 소유합니다.
  // 지도와 목록 같은 자식 컴포넌트는 필요한 값과 선택 함수를 props로 받습니다.
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

  const {
    populationLevel,
    availabilityQuery,
    availabilityItems,
    availableMonths,
    availableYears,
    effectiveStatsYm,
    effectiveYear,
    effectiveMonth,
    selectedMonthAvailability,
    effectiveComparisonBaseYm,
    comparisonBaseAvailability,
    availableMonthsInYear,
    populationQuery,
    populationMaximum,
    setSelectedStatsYm,
    setComparisonBaseYm,
  } = usePopulationPeriod(boundaryType)

  const isLocked = useAccessState() === 'locked'

  const { facilitiesQuery, visibleFacilityItems, facilityCountByCategory } = useFacilityData(visibleFacilityCategories)

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

  const { majorRoadsQuery, waterwaysQuery } = useMapOverlayData()

  const { similarDensityQuery, comparisonQuery, trendQuery } = useRegionDetailQueries({
    selectedRegion,
    boundaryType,
    populationLevel,
    effectiveYear,
    effectiveMonth,
    effectiveStatsYm,
    effectiveComparisonBaseYm,
    availableMonths,
    isLocked,
  })

  const {
    administrativeBoundaryQuery,
    legalBoundaryQuery,
    administrativeExportRegions,
    exportRegionOptions,
  } = useRegionBoundaries(boundaryType, searchTerm.trim().length > 0 || selectedRegion != null)

  const {
    developmentAreasQuery,
    developmentNoticesQuery,
    selectedDevelopmentAreas,
    developmentYearOptions,
    visibleDevelopmentAreaIds,
  } = useDevelopmentLayers({
    // 도형 파일은 검색하거나 개발계획을 볼 때만 읽어 첫 화면의 부담을 줄입니다.
    shouldLoad:
      searchTerm.trim().length > 0 ||
      developmentControlsOpen ||
      sidePanelView === 'development' ||
      showDevelopmentAreas,
    selectedDevelopmentAreaIds,
    developmentYearFilter,
    hideEndedDevelopmentAreas,
  })

  const siteSearchResults = useMemo(
    () => buildSiteSearchResults({
      searchTerm,
      administrativeFeatures: administrativeBoundaryQuery.data?.features ?? [],
      legalFeatures: legalBoundaryQuery.data?.features ?? [],
      developmentFeatures: developmentAreasQuery.data?.features ?? [],
      notices: developmentNoticesQuery.data?.items ?? [],
      facilities: facilitiesQuery.data?.items ?? [],
    }),
    [
      administrativeBoundaryQuery.data,
      developmentAreasQuery.data,
      developmentNoticesQuery.data,
      facilitiesQuery.data,
      legalBoundaryQuery.data,
      searchTerm,
    ],
  )

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

  const {
    spatialAnalysisPending,
    selectedFacilityCounts,
    selectedWaterwayCount,
    selectedLivingFacilityCount,
  } = useSelectedRegionSpatial({
    selectedRegion,
    boundaryType,
    administrativeBoundaries: administrativeBoundaryQuery.data,
    legalBoundaries: legalBoundaryQuery.data,
    facilities: facilitiesQuery.data?.items,
    waterways: waterwaysQuery.data,
  })


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
      <DashboardRail
        sidePanelView={sidePanelView}
        onShowRegion={() => {
          setSidePanelView('region')
          setIsSidePanelCollapsed(false)
        }}
        onShowDevelopment={() => {
          setSidePanelView('development')
          setIsSidePanelCollapsed(false)
          // 패널을 열어도 지도에 구역이 없으면 고를 수가 없으므로 함께 켭니다.
          setShowDevelopmentAreas(true)
        }}
        onShowFacility={() => {
          setSidePanelView('facility')
          setIsSidePanelCollapsed(false)
        }}
      />

      <section className="filter-card" id="dashboard-filters" aria-label="조회 조건">
        <BoundaryFilter
          value={boundaryType}
          onChange={(next) => {
            setBoundaryType(next)
            setSelectedRegion(null)
            setPairComparison(null)
            clearAddressSearch()
          }}
        />

        <PeriodFilters
          years={availableYears}
          year={effectiveYear}
          months={availableMonthsInYear}
          month={effectiveMonth}
          loading={availabilityQuery.isLoading}
          locked={isLocked}
          isPartialMonth={(optionMonth) => availabilityItems.find(
            (item) => item.statsYm === `${effectiveYear}${String(optionMonth).padStart(2, '0')}`,
          )?.complete === false}
          onYearChange={(optionYear) => setSelectedStatsYm(selectPopulationMonthInYear(
            availabilityItems,
            populationLevel,
            optionYear,
            effectiveMonth,
          ))}
          onMonthChange={(optionMonth) => setSelectedStatsYm(
            `${effectiveYear}${String(optionMonth).padStart(2, '0')}`,
          )}
        />

        {isLocked ? (
          <div className="population-export">
            <button type="button" className="population-export-open" onClick={() => void requestLogin(true)}>
              자료 내려받기
            </button>
          </div>
        ) : (
        <PopulationCsvExport
          level={populationLevel}
          regionCode={selectedRegion?.code ?? ''}
          regionOptions={exportRegionOptions}
          administrativeRegions={administrativeExportRegions}
          statsYm={effectiveStatsYm}
          availableMonths={availableMonths}
        />
        )}
        <GisDataLink className="dashboard-figure-mobile-link">
          GIS 자료
        </GisDataLink>

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
        {availabilityQuery.isError && !isLocked && (
          <span className="query-status error" role="alert">
            조회 가능한 기간을 확인하지 못했습니다.
          </span>
        )}
        {isLocked && (
          <span className="query-status locked" role="status">
            로그인하면 인구 통계를 확인할 수 있습니다.
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
        <AccountMenu />
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
          <div className="card-heading" id="map-layers">
            <div>
              <h2>{boundaryLabel} 인구 분포</h2>
            </div>

            <MapLayerToolbar
              showBoundaryFill={showBoundaryFill}
              setShowBoundaryFill={setShowBoundaryFill}
              showRoadTraffic={showRoadTraffic}
              setShowRoadTraffic={setShowRoadTraffic}
              showWaterways={showWaterways}
              setShowWaterways={setShowWaterways}
              showMajorRoads={showMajorRoads}
              setShowMajorRoads={setShowMajorRoads}
              showDevelopmentAreas={showDevelopmentAreas}
              setShowDevelopmentAreas={setShowDevelopmentAreas}
              hideEndedDevelopmentAreas={hideEndedDevelopmentAreas}
              setHideEndedDevelopmentAreas={setHideEndedDevelopmentAreas}
              developmentYearFilter={developmentYearFilter}
              setDevelopmentYearFilter={setDevelopmentYearFilter}
              developmentYearOptions={developmentYearOptions}
              developmentControlsOpen={developmentControlsOpen}
              toggleDevelopmentControls={toggleDevelopmentControls}
              facilityControlsOpen={facilityControlsOpen}
              toggleFacilityControls={toggleFacilityControls}
              visibleFacilityCategories={visibleFacilityCategories}
              toggleFacilityCategory={toggleFacilityCategory}
              facilityCountByCategory={facilityCountByCategory}
              populationMaximum={populationMaximum}
              waterwaysFailed={waterwaysQuery.isError}
              majorRoadsFailed={majorRoadsQuery.isError}
              developmentAreasFailed={developmentAreasQuery.isError}
              developmentLoading={developmentAreasQuery.isLoading || developmentNoticesQuery.isLoading}
              facilitiesLoading={facilitiesQuery.isLoading}
              facilitiesFailed={facilitiesQuery.isError}
              facilityCountsReady={Boolean(facilitiesQuery.data)}
            />
          </div>

          <MapErrorBoundary label="지도">
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
          </MapErrorBoundary>
        </div>

        <aside className="detail-card" id="region-detail" aria-live="polite">
          {sidePanelView === 'development' ? (
            <DevelopmentSidePanel
              selectedDevelopmentAreas={selectedDevelopmentAreas}
              noticesPending={!developmentNoticesQuery.data && developmentNoticesQuery.isPending}
              noticesFailed={!developmentNoticesQuery.data && developmentNoticesQuery.isError}
            />
          ) : sidePanelView === 'facility' ? (
            <FacilitySidePanel selectedFacility={selectedFacility} />
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
                    <RegionSummaryTab
                      selectedStats={selectedStats}
                      spatialAnalysisPending={spatialAnalysisPending}
                      selectedWaterwayCount={selectedWaterwayCount}
                      selectedFacilityCounts={selectedFacilityCounts}
                      selectedLivingFacilityCount={selectedLivingFacilityCount}
                      onStartComparison={ENABLE_TWO_REGION_COMPARISON ? () => {
                        setPairComparison({
                          type: boundaryType,
                          firstCode: selectedRegion.code,
                          secondCode: null,
                          pickingSecond: true,
                        })
                        setDetailTab('ranking')
                      } : undefined}
                    />
                  )}

                  {detailTab === 'change' && (
                    <RegionChangeTab
                      boundaryType={boundaryType}
                      availabilityLoading={availabilityQuery.isLoading}
                      availableMonths={availableMonths}
                      availabilityItems={availabilityItems}
                      effectiveStatsYm={effectiveStatsYm}
                      effectiveComparisonBaseYm={effectiveComparisonBaseYm}
                      onComparisonBaseChange={setComparisonBaseYm}
                      comparisonBaseAvailability={comparisonBaseAvailability}
                      comparisonQuery={comparisonQuery}
                      similarDensityQuery={similarDensityQuery}
                      trendQuery={trendQuery}
                    />
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
                isLocked ? <LockedStats /> : <p className="detail-help">
                  {populationQuery.isLoading
                    ? '인구 데이터를 불러오는 중입니다.'
                    : populationQuery.data?.meta.dataAvailable === false
                      ? '선택한 기간의 데이터가 아직 없습니다.'
                      : '선택한 지역의 통계가 없습니다.'}
                </p>
              )}
            </div>
          ) : isLocked ? (
            <LockedStats />
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


    </main>
  )
}
