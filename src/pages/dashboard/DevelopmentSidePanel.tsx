import type { DevelopmentAreaSelection } from '../../features/development/developmentMatching'

export default function DevelopmentSidePanel({ selectedDevelopmentAreas, noticesPending, noticesFailed }: {
  selectedDevelopmentAreas: DevelopmentAreaSelection[]
  noticesPending: boolean
  noticesFailed: boolean
}) {
  return (
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
              {noticesPending ? (
                <span className="description-empty-notice" role="status">
                  관련 고시를 불러오는 중입니다.
                </span>
              ) : noticesFailed ? (
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
  )
}
