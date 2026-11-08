import MapErrorBoundary from '../../components/map/MapErrorBoundary'
import NaverRoadview from '../../components/map/NaverRoadview'
import { FACILITY_OPTIONS, type FacilityItem } from '../../features/facilities/facilityApi'

export default function FacilitySidePanel({ selectedFacility }: { selectedFacility: FacilityItem | null }) {
  return (
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
        <MapErrorBoundary label="거리뷰" key={selectedFacility.id}>
        <NaverRoadview
          key={selectedFacility.id}
          latitude={selectedFacility.latitude}
          longitude={selectedFacility.longitude}
          placeName={selectedFacility.name}
          address={selectedFacility.roadAddress || selectedFacility.parcelAddress}
        />
        </MapErrorBoundary>
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
  )
}
