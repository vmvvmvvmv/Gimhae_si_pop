import type { FacilityCategory } from '../../features/facilities/facilityApi'
import type { AdminPopulationRegion } from '../../features/population/populationApi'
import { formatChange } from './dashboardFormat'

interface RegionSummaryTabProps {
  selectedStats: AdminPopulationRegion
  spatialAnalysisPending: boolean
  selectedWaterwayCount: number | null
  selectedFacilityCounts: Map<FacilityCategory, number>
  selectedLivingFacilityCount: number
  onStartComparison?: () => void
}

export default function RegionSummaryTab({
  selectedStats, spatialAnalysisPending, selectedWaterwayCount, selectedFacilityCounts, selectedLivingFacilityCount, onStartComparison,
}: RegionSummaryTabProps) {
  return (
    <div
      className="detail-tab-panel summary-tab-panel"
      role="tabpanel"
    >
      <section
        className="summary-section"
        aria-labelledby="population-summary-title"
      >
        <div className="section-title">
          <div>
            <h3 id="population-summary-title">
              인구와 세대
            </h3>
          </div>
          <span>조회월 기준</span>
        </div>
        <dl className="summary-metric-list">
          <div>
            <dt>총인구</dt>
            <dd>{selectedStats.population.toLocaleString()}명</dd>
          </div>
          <div>
            <dt>세대 수</dt>
            <dd>{selectedStats.households.toLocaleString()}세대</dd>
          </div>
          <div>
            <dt>세대당 인구</dt>
            <dd>
              {selectedStats.populationPerHousehold.toFixed(2)}명
            </dd>
          </div>
          <div>
            <dt>전월 대비</dt>
            <dd>
              {formatChange(
                selectedStats.comparisons.previousMonth.change,
                selectedStats.comparisons.previousMonth.changeRate,
              )}
            </dd>
          </div>
          <div>
            <dt>전년 동월 대비</dt>
            <dd>
              {formatChange(
                selectedStats.comparisons.previousYear.change,
                selectedStats.comparisons.previousYear.changeRate,
              )}
            </dd>
          </div>
          <div>
            <dt>면적 · 인구밀도</dt>
            <dd>
              {selectedStats.areaKm2.toFixed(2)}㎢ ·{' '}
              {selectedStats.populationDensity.toLocaleString()}명/㎢
            </dd>
          </div>
        </dl>
        {onStartComparison && <button
          type="button"
          className="two-region-start"
          onClick={onStartComparison}
        >
          이 동을 다른 동과 비교하기
        </button>}
      </section>

      <section
        className="reorganization-analysis"
        aria-labelledby="reorganization-analysis-title"
      >
        <div className="section-title">
          <div>
            <small>주요 시설</small>
            <h3 id="reorganization-analysis-title">
              경계와 생활권
            </h3>
          </div>
        </div>
        <div className="reorganization-indicator-grid">
          <article className="natural-barrier">
            <span aria-hidden="true">≈</span>
            <small>하천망 구역</small>
            <strong>
              {spatialAnalysisPending || selectedWaterwayCount === null
                ? '확인 중'
                : `${selectedWaterwayCount}개`}
            </strong>
          </article>
          <article className="connection-point">
            <span aria-hidden="true">↔</span>
            <small>교량</small>
            <strong>
              {spatialAnalysisPending
                ? '확인 중'
                : `${selectedFacilityCounts.get('BRIDGE') ?? 0}개`}
            </strong>
          </article>
          <article className="mobility-point">
            <span aria-hidden="true">●</span>
            <small>교통거점</small>
            <strong>
              {spatialAnalysisPending
                ? '확인 중'
                : `${selectedFacilityCounts.get('TRANSIT') ?? 0}개`}
            </strong>
          </article>
          <article className="living-point">
            <span aria-hidden="true">＋</span>
            <small>생활 주요 시설</small>
            <strong>
              {spatialAnalysisPending
                ? '확인 중'
                : `${selectedLivingFacilityCount}개`}
            </strong>
          </article>
        </div>
      </section>
    </div>
  )
}
