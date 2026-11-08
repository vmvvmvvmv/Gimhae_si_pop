// 지도 위에 겹쳐 보여 주는 안내입니다. 지도 객체와 상관없는 순수 표시 컴포넌트입니다.
export function MajorRoadNote() {
  return (
    <div className="major-road-map-note" role="status">
      <strong>주요 도로</strong>
      <span><i className="six-lane" aria-hidden="true" />6~7차로</span>
      <span><i className="eight-lane" aria-hidden="true" />8차로 이상</span>
      <small>VWorld 도로중심선</small>
    </div>
  )
}

export function DevelopmentMapLegend({ noticeCount }: { noticeCount: number }) {
  return (
    <div className="development-map-legend" aria-label="개발계획 범례">
      <strong>공식 지정·고시 구역</strong>
      <span><i className="industrial" />산업단지</span>
      <span><i className="district" />지구단위계획</span>
      <span><i className="public" />공공 개발사업</span>
      <span><i className="promotion" />개발진흥지구</span>
      <small>
        구역 경계 VWorld · 관련 고시 김해 UPIS{' '}
        {noticeCount.toLocaleString()}건
      </small>
    </div>
  )
}

export function MapStatusMessage({ status }: { status: string }) {
  return (
    <div className="map-message" aria-live="polite">
      {status === 'loading' && (
        <>
          <span className="loading-spinner map-loading-spinner" aria-hidden="true" />
          <strong>김해시 지도를 불러오는 중입니다</strong>
          <span>지역 경계와 지도 정보를 함께 불러오고 있습니다.</span>
        </>
      )}

      {status === 'missing-key' && (
        <>
          <strong>네이버 지도 Client ID가 필요합니다.</strong>
          <span>
            .env의 VITE_NAVER_MAP_CLIENT_ID 값을 확인해 주세요.
          </span>
        </>
      )}

      {status === 'error' && (
        <>
          <strong>지도를 불러오지 못했습니다.</strong>
          <span>
            Client ID와 localhost 허용 도메인을 확인해 주세요.
          </span>
        </>
      )}
    </div>
  )
}
