import type { UseQueryResult } from '@tanstack/react-query'
import PopulationTrendChart from '../../components/common/PopulationTrendChart'
import type { BoundaryType } from '../../features/boundaries/boundaryLoader'
import type {
  PopulationAvailabilityItem,
  PopulationComparisonResponse,
  PopulationTrendResponse,
  SimilarDensityResponse,
} from '../../features/population/populationApi'
import { formatChange } from './dashboardFormat'

type QueryView<T> = Pick<UseQueryResult<T>, 'data' | 'isError' | 'isFetching' | 'isLoading'>

interface RegionChangeTabProps {
  boundaryType: BoundaryType
  availabilityLoading: boolean
  availableMonths: string[]
  availabilityItems: PopulationAvailabilityItem[]
  effectiveStatsYm: string
  effectiveComparisonBaseYm: string
  onComparisonBaseChange: (statsYm: string) => void
  comparisonBaseAvailability: PopulationAvailabilityItem | undefined
  comparisonQuery: QueryView<PopulationComparisonResponse>
  similarDensityQuery: QueryView<SimilarDensityResponse>
  trendQuery: QueryView<PopulationTrendResponse>
}

export default function RegionChangeTab({
  boundaryType, availabilityLoading, availableMonths, availabilityItems, effectiveStatsYm, effectiveComparisonBaseYm, onComparisonBaseChange, comparisonBaseAvailability, comparisonQuery, similarDensityQuery, trendQuery,
}: RegionChangeTabProps) {
  const similarDensityComparison = similarDensityQuery.data?.comparison
  const similarDensityAverage =
    similarDensityComparison?.averageDensityPerKm2 ?? null
  const densityMultiple =
    similarDensityComparison?.targetToAverageRatio ?? null
  const densityDifferenceWidth = densityMultiple === null
    ? 0
    : Math.min(Math.abs(densityMultiple - 1), 0.5) * 100
  const densityDirection =
    densityMultiple !== null && densityMultiple >= 1
      ? 'higher'
      : 'lower'
  const comparisonRate = comparisonQuery.data?.changeRate ?? null
  const comparisonRateWidth = comparisonRate === null
    ? 0
    : Math.min(Math.abs(comparisonRate), 10) * 5
  const comparisonRateDirection =
    comparisonRate !== null && comparisonRate >= 0 ? 'positive' : 'negative'

  return (
      <div className="detail-tab-panel" role="tabpanel">
    <div className="manual-comparison">
      <div className="section-title">
        <div>
          <small>기준월 비교</small>
          <h3>
            {effectiveComparisonBaseYm
              ? `${effectiveComparisonBaseYm.slice(0, 4)}년 ${Number(effectiveComparisonBaseYm.slice(4))}월 대비`
              : '비교할 이전 월이 없습니다'}
          </h3>
        </div>
        <div className="comparison-heading-control">
          <select
            value={effectiveComparisonBaseYm}
            onChange={(event) => onComparisonBaseChange(event.target.value)}
            aria-label="기준월 선택"
            disabled={
              availabilityLoading || availableMonths.length < 2
            }
          >
            {!effectiveComparisonBaseYm && (
              <option value="">기준월 선택</option>
            )}
            {availableMonths
              .filter((statsYm) => statsYm !== effectiveStatsYm)
              .slice()
              .reverse()
              .map((statsYm) => (
                <option key={statsYm} value={statsYm}>
                  {statsYm.slice(0, 4)}년{' '}
                  {Number(statsYm.slice(4))}월
                  {availabilityItems.find((item) => item.statsYm === statsYm)?.complete === false
                    ? ' (일부)'
                    : ''}
                </option>
              ))}
          </select>
          {comparisonQuery.isFetching && (
            <span className="inline-loading-state">
              <span className="loading-spinner" aria-hidden="true" />
              계산 중
            </span>
          )}
        </div>
      </div>
      {comparisonBaseAvailability && !comparisonBaseAvailability.complete && (
        <p className="comparison-data-warning" role="status">
          기준월 자료 일부 적재: {comparisonBaseAvailability.storedRegionCount}/
          {comparisonBaseAvailability.expectedRegionCount}곳 ·{' '}
          {Math.max(comparisonBaseAvailability.expectedRegionCount - comparisonBaseAvailability.storedRegionCount, 0)}곳 누락
        </p>
      )}
      {comparisonQuery.isError ? (
        <p className="comparison-empty" role="alert">
          기준월 비교 데이터를 불러오지 못했습니다.
        </p>
      ) : comparisonQuery.data ? (
        <div className="comparison-grid manual-comparison-grid">
          <div>
            <small>기준월 인구</small>
            <strong>
              {comparisonQuery.data.base
                ? `${comparisonQuery.data.base.population.toLocaleString()}명`
                : '데이터 없음'}
            </strong>
          </div>
          <div>
            <small>조회월 인구</small>
            <strong>
              {comparisonQuery.data.target
                ? `${comparisonQuery.data.target.population.toLocaleString()}명`
                : '데이터 없음'}
            </strong>
          </div>
          <div>
            <small>증감</small>
            <strong>
              {formatChange(
                comparisonQuery.data.change,
                comparisonQuery.data.changeRate,
              )}
            </strong>
          </div>
        </div>
      ) : (
        <p className="comparison-empty">
          이 지역은 기준월과 비교할 데이터가 없습니다.
        </p>
      )}
    </div>

    <div className="visual-summary" aria-label="핵심 지표 시각화">
      <div className="visual-metric">
        <div className="visual-metric-heading">
          <span>기준월 대비 증감률</span>
          <strong>
            {comparisonRate === null
              ? '비교 데이터 없음'
              : `${comparisonRate > 0 ? '+' : ''}${comparisonRate.toFixed(2)}%`}
          </strong>
        </div>
        <div
          className="delta-meter"
          role="progressbar"
          aria-label="기준월 대비 증감률"
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={
            comparisonRate === null
              ? 0
              : Math.min(Math.abs(comparisonRate), 10)
          }
          aria-valuetext={
            comparisonRate === null
              ? '비교 데이터 없음'
              : `${comparisonRate.toFixed(2)}퍼센트`
          }
        >
          <span className="delta-meter-center" aria-hidden="true" />
          <span
            className={`delta-meter-fill ${comparisonRateDirection}`}
            style={{ width: `${comparisonRateWidth}%` }}
            aria-hidden="true"
          />
        </div>
        <small>왼쪽 감소 · 오른쪽 증가 · ±10% 기준</small>
      </div>

      <div className="visual-metric">
        <div className="visual-metric-heading">
          <span>면적 유사 지역 대비 인구밀도</span>
          <strong>
            {boundaryType !== 'administrative'
              ? '행정동 전용'
              : similarDensityQuery.isLoading
                ? '계산 중...'
                : densityMultiple === null
                  ? '비교 데이터 없음'
                  : `${densityMultiple.toFixed(2)}배`}
          </strong>
        </div>
        <div
          className="density-comparison-meter"
          role="meter"
          aria-label="면적 유사 지역 평균 대비 인구밀도 배수"
          aria-valuemin={0.5}
          aria-valuemax={1.5}
          aria-valuenow={densityMultiple ?? undefined}
          aria-valuetext={
            densityMultiple === null
              ? '비교 데이터 없음'
              : `${densityMultiple.toFixed(2)}배`
          }
        >
          <span
            className="density-meter-center"
            aria-hidden="true"
          />
          <span
            className={`density-comparison-fill ${densityDirection}`}
            style={{ width: `${densityDifferenceWidth}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="density-meter-axis" aria-hidden="true">
          <span>0.5배 이하</span>
          <strong>1.0배</strong>
          <span>1.5배 이상</span>
        </div>
        <small>
          {boundaryType !== 'administrative'
            ? '면적이 비슷한 지역 비교는 행정동 화면에서 볼 수 있습니다.'
            : similarDensityQuery.isError
              ? '면적 유사 지역 비교를 불러오지 못했습니다.'
              : similarDensityAverage === null
                ? '전국 행정동 인구 데이터를 동기화하면 비교값이 나옵니다.'
                : `면적 ±10% 지역 ${similarDensityComparison?.sampleCount ?? 0}곳 평균 ${similarDensityAverage.toLocaleString()}명/㎢`}
        </small>
      </div>
    </div>

    <p className="area-note">
      ※ 면적은 GeoJSON 경계로 계산해 공식 면적과 약 ±1㎢ 차이 날 수 있습니다.
    </p>

    <div className="trend-section">
      <div className="section-title">
        <div>
          <small>장기 변화</small>
          <h3>월별 인구 추이</h3>
        </div>
        {trendQuery.isFetching && (
          <span className="inline-loading-state">
            <span className="loading-spinner" aria-hidden="true" />
            불러오는 중
          </span>
        )}
      </div>
      {trendQuery.isError ? (
        <p className="comparison-empty" role="alert">
          장기 인구 추이를 불러오지 못했습니다.
        </p>
      ) : trendQuery.data ? (
        <PopulationTrendChart
          data={trendQuery.data}
        />
      ) : (
        <div className="chart-empty inline-loading-state">
          <span className="loading-spinner" aria-hidden="true" />
          장기 인구 데이터를 불러오는 중입니다.
        </div>
      )}
    </div>
      </div>
  )
}
