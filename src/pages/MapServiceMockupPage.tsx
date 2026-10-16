import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import './MapServiceMockupPage.css'

type IconName =
  | 'arrow'
  | 'back'
  | 'bookmark'
  | 'bus'
  | 'car'
  | 'close'
  | 'crosshair'
  | 'grid'
  | 'home'
  | 'layers'
  | 'location'
  | 'menu'
  | 'more'
  | 'route'
  | 'search'
  | 'share'
  | 'train'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="m5 12 14-7-6 14-2.2-5.8L5 12Z" />,
    back: <path d="m15 5-7 7 7 7" />,
    bookmark: <path d="M7 4.5h10v15l-5-3-5 3v-15Z" />,
    bus: <><rect x="5" y="3" width="14" height="17" rx="3" /><path d="M7 7h10v6H7zM8 20v2M16 20v2M8 16h.01M16 16h.01" /></>,
    car: <><path d="m5 11 2-5h10l2 5v8H5v-8Z" /><path d="M3 12h18M7 16h.01M17 16h.01M7 19v2M17 19v2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    crosshair: (
      <>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    home: <><path d="m4 11 8-7 8 7" /><path d="M6.5 10v10h11V10M10 20v-6h4v6" /></>,
    layers: (
      <>
        <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
        <path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" />
      </>
    ),
    location: <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Zm0-8.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />,
    menu: <path d="M5 7h14M5 12h14M5 17h14" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    route: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h2a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 4.5 4.5" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="m8 11 8-5M8 13l8 5" />
      </>
    ),
    train: <><rect x="6" y="3" width="12" height="16" rx="3" /><path d="M8 8h8M8 13h.01M16 13h.01M9 19l-2 3M15 19l2 3" /></>,
  }

  return (
    <svg aria-hidden="true" className="ui-icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  )
}

const actions: Array<{ label: string; icon: IconName; primary?: boolean }> = [
  { label: '출발', icon: 'arrow', primary: true },
  { label: '도착', icon: 'location' },
  { label: '공유', icon: 'share' },
  { label: '저장', icon: 'bookmark' },
]

const tabs = ['홈', '메뉴', '리뷰', '사진', '정보']

export default function MapServiceMockupPage() {
  return (
    <main className="map-service-shell">
      <section aria-label="김해 생활지도" className="mock-map">
        <div className="map-water water-one" />
        <div className="map-water water-two" />
        <div className="map-park park-one"><span>연지공원</span></div>
        <div className="map-park park-two"><span>해반천 산책길</span></div>
        <div className="map-blocks blocks-one" />
        <div className="map-blocks blocks-two" />
        <div className="map-road road-main"><span>김해대로</span></div>
        <div className="map-road road-cross"><span>분성로</span></div>
        <div className="map-road road-small-one" />
        <div className="map-road road-small-two" />
        <div className="map-label label-one">부원동</div>
        <div className="map-label label-two">봉황동</div>
        <div className="map-label label-three">내외동</div>

        <button aria-label="연지공원 위치" className="place-marker marker-one" type="button">
          <Icon name="location" />
        </button>
        <button aria-label="김해세무서 위치" className="place-marker marker-two" type="button">
          <Icon name="location" />
        </button>
        <button aria-label="봉황대공원 위치" className="place-marker marker-three" type="button">
          <Icon name="location" />
        </button>

        <div className="selected-place" role="status">
          <div className="selected-place__pin"><Icon name="location" /></div>
          <div>
            <strong>김해시청</strong>
            <span>공공기관 · 평점 4.6</span>
          </div>
          <button type="button">길찾기</button>
        </div>

        <div className="map-toolbar" aria-label="지도 도구">
          <div className="map-type-switch" role="group" aria-label="지도 유형">
            <button className="is-active" type="button">지도</button>
            <button type="button">위성</button>
          </div>
          <div className="map-control-stack">
            <button aria-label="지도 레이어" type="button"><Icon name="layers" /></button>
            <button aria-label="현재 위치" type="button"><Icon name="crosshair" /></button>
            <button aria-label="거리 재기" type="button"><Icon name="route" /></button>
            <button aria-label="저장한 장소" type="button"><Icon name="bookmark" /></button>
          </div>
          <div className="map-control-stack zoom-controls">
            <button aria-label="확대" type="button">+</button>
            <button aria-label="축소" type="button">−</button>
          </div>
        </div>

        <div className="map-scale">200 m</div>
      </section>

      <nav className="service-rail" aria-label="지도 서비스 메뉴">
        <Link className="rail-brand" to="/" aria-label="김해 생활지도 홈">G</Link>
        <div className="rail-main-menu">
          <button className="is-active" type="button"><Icon name="home" /><span>지도 홈</span></button>
          <button type="button"><Icon name="route" /><span>길찾기</span></button>
          <button type="button"><Icon name="bus" /><span>버스</span></button>
          <button type="button"><Icon name="train" /><span>경전철</span></button>
          <button type="button"><Icon name="car" /><span>교통</span></button>
          <button type="button"><Icon name="bookmark" /><span>저장</span></button>
          <button type="button"><Icon name="more" /><span>더보기</span></button>
        </div>
        <div className="rail-footer">
          <button aria-label="전체 서비스" type="button"><Icon name="grid" /></button>
        </div>
      </nav>

      <aside className="place-panel">
        <header className="panel-header">
          <label className="place-search">
            <span className="sr-only">장소 검색</span>
            <Icon name="search" />
            <input defaultValue="김해시청" readOnly />
            <button aria-label="검색" type="button">검색</button>
          </label>
        </header>

        <div className="panel-scroll-area">
          <div className="panel-command-row">
            <button aria-label="뒤로 가기" type="button"><Icon name="back" /></button>
            <span>장소 상세</span>
            <button aria-label="상세 패널 닫기" type="button"><Icon name="close" /></button>
          </div>
          <section className="place-hero" aria-label="김해시청 대표 이미지">
            <div className="city-illustration city-illustration--main">
              <div className="city-sky" />
              <div className="city-building building-left" />
              <div className="city-building building-center"><span>김해시청</span></div>
              <div className="city-building building-right" />
              <div className="city-trees" />
            </div>
            <div className="city-illustration city-illustration--side">
              <div className="side-photo-building" />
              <div className="side-photo-tree" />
              <span>시민광장</span>
            </div>
            <span className="photo-count">사진 24</span>
          </section>

          <section className="place-summary">
            <div className="place-category">공공기관 · 시청</div>
            <h1>김해시청</h1>
            <div className="rating-line">
              <strong><span aria-hidden="true">★</span> 4.6</strong>
              <span>방문자 리뷰 128</span>
              <span>사진 리뷰 54</span>
            </div>
            <div className="open-status">
              <span className="status-dot" />
              <strong>운영 중</strong>
              <span>평일 09:00–18:00</span>
            </div>
          </section>

          <div className="place-actions" aria-label="장소 주요 기능">
            {actions.map((action) => (
              <button className={action.primary ? 'is-primary' : ''} key={action.label} type="button">
                <span><Icon name={action.icon} /></span>
                {action.label}
              </button>
            ))}
          </div>

          <section className="place-section details-section">
            <h2>장소 정보</h2>
            <dl>
              <div>
                <dt><Icon name="location" /><span className="sr-only">주소</span></dt>
                <dd>경남 김해시 김해대로 2401</dd>
              </div>
              <div>
                <dt><span className="detail-symbol">☎</span><span className="sr-only">전화번호</span></dt>
                <dd>1577-9400</dd>
              </div>
              <div>
                <dt><span className="detail-symbol">ⓘ</span><span className="sr-only">안내</span></dt>
                <dd>민원실은 본관 1층에 있습니다.</dd>
              </div>
            </dl>
          </section>

          <section className="place-section gallery-section">
            <div className="section-title-row">
              <h2>장소 사진</h2>
              <button type="button">전체 보기</button>
            </div>
            <div className="photo-grid">
              <div className="gallery-photo gallery-photo--one"><span>청사 전경</span></div>
              <div className="gallery-photo gallery-photo--two"><span>민원실</span></div>
              <div className="gallery-photo gallery-photo--three"><span>시민광장</span></div>
            </div>
          </section>

          <section className="place-section review-preview">
            <div className="section-title-row">
              <h2>방문자 리뷰</h2>
              <button type="button">128개 모두 보기</button>
            </div>
            <p>“안내가 친절했고 민원 창구를 찾기 쉬웠어요.”</p>
          </section>
        </div>

        <nav className="place-tabs" aria-label="장소 상세 메뉴">
          {tabs.map((tab, index) => (
            <button aria-selected={index === 0} className={index === 0 ? 'is-active' : ''} key={tab} role="tab" type="button">
              {tab}
            </button>
          ))}
        </nav>
      </aside>

      <button className="mobile-menu-button" aria-label="메뉴 열기" type="button">
        <Icon name="menu" />
      </button>
    </main>
  )
}
