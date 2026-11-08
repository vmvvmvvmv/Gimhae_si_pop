// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOGIN_REQUIRED_EVENT, finishLogin } from '../../lib/authRedirect'
import ReportFiguresPage from '../ReportFiguresPage'
import DashboardRail from './DashboardRail'
import DevelopmentSidePanel from './DevelopmentSidePanel'
import FacilitySidePanel from './FacilitySidePanel'
import GisDataLink from './GisDataLink'
import MapLayerToolbar from './MapLayerToolbar'

function stubLoggedOutApi() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
}

function renderWithApp(ui: ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  finishLogin(false)
  vi.unstubAllGlobals()
})

type ToolbarProps = ComponentProps<typeof MapLayerToolbar>

function toolbar(overrides: Partial<ToolbarProps> = {}) {
  const noop = vi.fn()
  const props: ToolbarProps = {
    showBoundaryFill: true, setShowBoundaryFill: noop,
    showRoadTraffic: false, setShowRoadTraffic: noop,
    showWaterways: true, setShowWaterways: noop,
    showMajorRoads: true, setShowMajorRoads: noop,
    showDevelopmentAreas: false, setShowDevelopmentAreas: noop,
    hideEndedDevelopmentAreas: false, setHideEndedDevelopmentAreas: noop,
    developmentYearFilter: 'all', setDevelopmentYearFilter: noop,
    developmentYearOptions: [2026],
    developmentControlsOpen: false, toggleDevelopmentControls: noop,
    facilityControlsOpen: false, toggleFacilityControls: noop,
    compactFacilityControls: true,
    visibleFacilityCategories: ['HOSPITAL'],
    toggleFacilityCategory: noop,
    facilityCountByCategory: new Map(),
    populationMaximum: 80000,
    waterwaysFailed: false, majorRoadsFailed: false, developmentAreasFailed: false,
    developmentLoading: false, facilitiesLoading: false, facilitiesFailed: false,
    facilityCountsReady: true,
    ...overrides,
  }
  return render(<MapLayerToolbar {...props} />)
}

describe('MapLayerToolbar', () => {
  const legend = () => screen.queryByLabelText(/인구수 색상 범례/)

  it('인구 색상을 칠할 때만 범례를 보여 준다', () => {
    toolbar()
    expect(legend()).not.toBeNull()
  })

  it('색상 필터를 끄면 범례를 숨긴다', () => {
    toolbar({ showBoundaryFill: false })
    expect(legend()).toBeNull()
  })

  it('도로 혼잡도를 켜면 범례를 숨기고 색상 필터를 잠근다', () => {
    toolbar({ showRoadTraffic: true })
    expect(legend()).toBeNull()
    expect((screen.getByRole('button', { name: '색상 필터' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('시설 메뉴에서 켜진 레이어 수를 보여 주고 종류를 바꿀 수 있다', () => {
    const toggleFacilityCategory = vi.fn()
    toolbar({ facilityControlsOpen: true, toggleFacilityCategory })
    // 켜진 시설 1개 + 주요 도로
    expect(screen.getByText('2개')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '학교 레이어 켜기' }))
    expect(toggleFacilityCategory).toHaveBeenCalledWith('SCHOOL')
  })
})

describe('DashboardRail', () => {
  it('개발계획과 주요 시설을 누르면 해당 패널을 연다', () => {
    stubLoggedOutApi()
    const onShowDevelopment = vi.fn()
    const onShowFacility = vi.fn()
    renderWithApp(
      <DashboardRail
        sidePanelView="region"
        onShowRegion={vi.fn()}
        onShowDevelopment={onShowDevelopment}
        onShowFacility={onShowFacility}
        onOpenGuide={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '개발계획' }))
    fireEvent.click(screen.getByRole('button', { name: '주요 시설' }))
    expect(onShowDevelopment).toHaveBeenCalledOnce()
    expect(onShowFacility).toHaveBeenCalledOnce()
  })
})

describe('설명 패널', () => {
  it('고른 것이 없으면 지도에서 선택하라고 안내한다', () => {
    render(<DevelopmentSidePanel selectedDevelopmentAreas={[]} noticesPending={false} noticesFailed={false} />)
    render(<FacilitySidePanel selectedFacility={null} />)
    expect(screen.getByText('지도에서 개발구역을 선택하면 관련 고시를 볼 수 있습니다.')).toBeTruthy()
    expect(screen.getByText('지도에서 시설 마커를 선택하면 상세 정보를 볼 수 있습니다.')).toBeTruthy()
  })
})

describe('로그인 전 GIS 자료', () => {
  it('링크를 누르면 이동하는 대신 로그인 창을 요청한다', async () => {
    stubLoggedOutApi()
    const onLoginRequired = vi.fn()
    window.addEventListener(LOGIN_REQUIRED_EVENT, onLoginRequired)
    renderWithApp(<GisDataLink>GIS 자료</GisDataLink>)

    // 로그인이 필요하다는 응답을 받을 때까지 기다린 뒤 누릅니다.
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2))
    await new Promise((resolve) => setTimeout(resolve, 20))
    fireEvent.click(screen.getByRole('link', { name: 'GIS 자료' }))

    expect(onLoginRequired).toHaveBeenCalledOnce()
    window.removeEventListener(LOGIN_REQUIRED_EVENT, onLoginRequired)
  })

  it('주소로 바로 들어오면 자료 대신 로그인 안내를 보여 준다', async () => {
    stubLoggedOutApi()
    renderWithApp(<ReportFiguresPage />, '/report-figures')

    expect(await screen.findByText('로그인하면 GIS 자료를 이용할 수 있습니다')).toBeTruthy()
    expect(screen.queryByLabelText('GIS 자료')).toBeNull()
  })
})
