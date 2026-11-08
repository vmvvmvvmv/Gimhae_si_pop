import AccountMenu from './AccountMenu'
import { DashboardRailIcon } from './DashboardRailIcon'
import GisDataLink from './GisDataLink'

export type SidePanelView = 'region' | 'development' | 'facility'

export default function DashboardRail({ sidePanelView, onShowRegion, onOpenGuide }: {
  sidePanelView: SidePanelView
  onShowRegion: () => void
  onOpenGuide: () => void
}) {
  return (
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
          onClick={onShowRegion}
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
        <GisDataLink>
          <DashboardRailIcon name="layers" />
          GIS 자료
        </GisDataLink>
      </div>
      <AccountMenu />
      <button
        type="button"
        className="dashboard-guide-trigger dashboard-guide-rail"
        onClick={onOpenGuide}
      >
        <span aria-hidden="true">?</span>
        사용 안내
      </button>
      <div className="dashboard-rail-caption">GIMHAE GIS</div>
    </nav>
  )
}
