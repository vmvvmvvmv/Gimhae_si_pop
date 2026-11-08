import AccountMenu from './AccountMenu'
import { DashboardRailIcon } from './DashboardRailIcon'
import GisDataLink from './GisDataLink'

export type SidePanelView = 'region' | 'development' | 'facility'

export default function DashboardRail({ sidePanelView, onShowRegion, onShowDevelopment, onShowFacility, onOpenGuide }: {
  sidePanelView: SidePanelView
  onShowRegion: () => void
  onShowDevelopment: () => void
  onShowFacility: () => void
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
        <button
          type="button"
          className={`rail-status-item ${sidePanelView === 'development' ? 'active' : ''}`}
          aria-current={sidePanelView === 'development' ? 'true' : undefined}
          onClick={onShowDevelopment}
        >
          <DashboardRailIcon name="development" />
          개발계획
        </button>
        <button
          type="button"
          className={`rail-status-item ${sidePanelView === 'facility' ? 'active' : ''}`}
          aria-current={sidePanelView === 'facility' ? 'true' : undefined}
          onClick={onShowFacility}
        >
          <DashboardRailIcon name="facility" />
          주요 시설
        </button>
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
