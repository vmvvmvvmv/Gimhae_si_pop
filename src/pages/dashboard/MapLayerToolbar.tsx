import type { Dispatch, SetStateAction } from 'react'
import { FACILITY_OPTIONS, type FacilityCategory } from '../../features/facilities/facilityApi'
import { DashboardRailIcon } from './DashboardRailIcon'
import { formatLegendPopulation } from './dashboardFormat'

interface MapLayerToolbarProps {
  showBoundaryFill: boolean
  setShowBoundaryFill: Dispatch<SetStateAction<boolean>>
  showRoadTraffic: boolean
  setShowRoadTraffic: Dispatch<SetStateAction<boolean>>
  showWaterways: boolean
  setShowWaterways: Dispatch<SetStateAction<boolean>>
  showMajorRoads: boolean
  setShowMajorRoads: Dispatch<SetStateAction<boolean>>
  showDevelopmentAreas: boolean
  setShowDevelopmentAreas: Dispatch<SetStateAction<boolean>>
  hideEndedDevelopmentAreas: boolean
  setHideEndedDevelopmentAreas: Dispatch<SetStateAction<boolean>>
  developmentYearFilter: string
  setDevelopmentYearFilter: (year: string) => void
  developmentYearOptions: number[]
  developmentControlsOpen: boolean
  toggleDevelopmentControls: () => void
  facilityControlsOpen: boolean
  toggleFacilityControls: () => void
  compactFacilityControls: boolean
  visibleFacilityCategories: FacilityCategory[]
  toggleFacilityCategory: (category: FacilityCategory) => void
  facilityCountByCategory: Map<FacilityCategory, number>
  populationMaximum: number
  waterwaysFailed: boolean
  majorRoadsFailed: boolean
  developmentAreasFailed: boolean
  developmentLoading: boolean
  facilitiesLoading: boolean
  facilitiesFailed: boolean
  facilityCountsReady: boolean
}

// 지도 위쪽의 레이어 설정 막대입니다. 표시 여부 상태는 지도도 함께 쓰므로 DashboardPage가 가지고 있습니다.
export default function MapLayerToolbar({
  showBoundaryFill, setShowBoundaryFill, showRoadTraffic, setShowRoadTraffic, showWaterways, setShowWaterways, showMajorRoads, setShowMajorRoads, showDevelopmentAreas, setShowDevelopmentAreas, hideEndedDevelopmentAreas, setHideEndedDevelopmentAreas, developmentYearFilter, setDevelopmentYearFilter, developmentYearOptions, developmentControlsOpen, toggleDevelopmentControls, facilityControlsOpen, toggleFacilityControls, compactFacilityControls, visibleFacilityCategories, toggleFacilityCategory, facilityCountByCategory, populationMaximum, waterwaysFailed, majorRoadsFailed, developmentAreasFailed, developmentLoading, facilitiesLoading, facilitiesFailed, facilityCountsReady,
}: MapLayerToolbarProps) {
  const activeFacilityLayerCount = visibleFacilityCategories.length
    + Number(showMajorRoads)
    + Number(showRoadTraffic)

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
          facilitiesFailed
            ? '시설 정보를 불러오지 못했습니다.'
            : undefined
        }
        onClick={() => toggleFacilityCategory(option.category)}
      >
        <i aria-hidden="true" />
        {option.label}
        {facilityCountsReady && (
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
      title={majorRoadsFailed
        ? '주요 도로 자료를 불러오지 못했습니다.'
        : 'VWorld 도로중심선의 차로 수 6 이상 구간입니다.'}
      disabled={majorRoadsFailed}
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

  return (
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
              ? '인구 색상을 끄고 모든 지역을 같은 색으로 표시'
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
          disabled={waterwaysFailed}
          onClick={() => setShowWaterways((visible) => !visible)}
        >
          <i aria-hidden="true" />
          하천망
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
          disabled={developmentAreasFailed}
          onClick={toggleDevelopmentControls}
        >
          <i aria-hidden="true" />
          개발계획
          {showDevelopmentAreas && (
            <span className="map-menu-state">ON</span>
          )}
          <span className="map-menu-chevron" aria-hidden="true" />
        </button>
        {developmentControlsOpen && (
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
              {developmentLoading && (
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
            {facilityControlsOpen && (
              <div
                id="facility-layer-menu"
                className="facility-popover"
                role="dialog"
                aria-label="주요 시설 지도 필터"
              >
                <div className="facility-popover-heading">
                  <strong>시설 레이어</strong>
                </div>
                {facilitiesLoading && (
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
      {populationMaximum > 0 && showBoundaryFill && !showRoadTraffic && (
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
  )
}
