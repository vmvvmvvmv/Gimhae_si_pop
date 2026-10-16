import type { AdminPopulationRegion } from '../../features/population/populationApi'
import {
  getAgeBandShares,
  getComparedRegions,
} from '../../features/population/twoRegionComparison'

interface TwoRegionComparisonProps {
  items: AdminPopulationRegion[]
  levelLabel: string
  statsYm: string
  firstCode: string
  secondCode: string | null
  pickingSecond: boolean
  onChooseSecond: (code: string) => void
  onPickOnMap: () => void
  onClear: () => void
}

function formatChange(value: number | null, rate: number | null): string {
  if (value === null || rate === null) return '자료 없음'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString()}명 (${sign}${rate.toFixed(2)}%)`
}

export default function TwoRegionComparison({
  items,
  levelLabel,
  statsYm,
  firstCode,
  secondCode,
  pickingSecond,
  onChooseSecond,
  onPickOnMap,
  onClear,
}: TwoRegionComparisonProps) {
  const [first, second] = getComparedRegions(items, firstCode, secondCode)
  const firstAge = first ? getAgeBandShares(first) : null
  const secondAge = second ? getAgeBandShares(second) : null
  const period = `${statsYm.slice(0, 4)}년 ${Number(statsYm.slice(4))}월`

  return (
    <section className="two-region-comparison" aria-labelledby="two-region-comparison-title">
      <div className="two-region-heading">
        <div>
          <small>{levelLabel} · {period}</small>
          <h3 id="two-region-comparison-title">두 동 나란히 비교</h3>
        </div>
        {secondCode && (
          <button type="button" className="two-region-clear" onClick={onClear}>
            비교 지우기
          </button>
        )}
      </div>
      <div className="two-region-pickers">
        <div className="two-region-first">
          <small>기준 지역</small>
          <strong>{first?.regionName ?? '이 달의 자료 없음'}</strong>
        </div>
        <label>
          <span>비교할 지역</span>
          <select
            value={secondCode ?? ''}
            onChange={(event) => onChooseSecond(event.target.value)}
            aria-label="비교할 두 번째 동 선택"
          >
            <option value="">두 번째 동 선택</option>
            {secondCode && !second && (
              <option value={secondCode}>{secondCode} · 이 달 자료 없음</option>
            )}
            {[...items]
              .filter((item) => item.regionCode !== firstCode)
              .sort((left, right) => left.regionName.localeCompare(right.regionName, 'ko'))
              .map((item) => (
                <option key={item.regionCode} value={item.regionCode}>
                  {item.regionName}
                </option>
              ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="two-region-map-pick"
        onClick={onPickOnMap}
        aria-pressed={pickingSecond}
      >
        {pickingSecond ? '지도 선택 취소' : '지도에서 다른 동 선택'}
      </button>
      {pickingSecond && (
        <p className="two-region-pick-help" role="status">
          지도에서 두 번째 {levelLabel}을 클릭해 주세요.
        </p>
      )}
      {secondCode && (
        <div className="two-region-map-key" aria-label="지도 경계색 안내">
          <span><i className="first" />기준 지역</span>
          <span><i className="second" />비교 지역</span>
        </div>
      )}

      {secondCode && !second ? (
        <p className="two-region-empty" role="status">
          비교할 지역의 {period} 인구 자료가 없습니다.
        </p>
      ) : first && second ? (
        <>
          <div className="two-region-table-wrap">
            <table className="two-region-table">
              <caption className="sr-only">같은 월 두 지역의 인구 지표 비교</caption>
              <thead>
                <tr>
                  <th scope="col">지표</th>
                  <th scope="col">{first.regionName}</th>
                  <th scope="col">{second.regionName}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">총인구</th>
                  <td>{first.population.toLocaleString()}명</td>
                  <td>{second.population.toLocaleString()}명</td>
                </tr>
                <tr>
                  <th scope="row">인구밀도</th>
                  <td>{first.populationDensity.toLocaleString()}명/㎢</td>
                  <td>{second.populationDensity.toLocaleString()}명/㎢</td>
                </tr>
                <tr>
                  <th scope="row">전년 동월 대비</th>
                  <td>{formatChange(first.comparisons.previousYear.change, first.comparisons.previousYear.changeRate)}</td>
                  <td>{formatChange(second.comparisons.previousYear.change, second.comparisons.previousYear.changeRate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="two-region-age">
            <h4>연령 구성</h4>
            <p>{first.regionName} / {second.regionName} 순서 · 각 지역 연령 인구 대비</p>
            {firstAge && secondAge ? (
              <div className="two-region-age-rows">
                {firstAge.map((band, index) => (
                  <div key={band.label}>
                    <span>{band.label}</span>
                    <strong>{band.percent.toFixed(1)}%</strong>
                    <strong>{secondAge[index].percent.toFixed(1)}%</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p>두 지역 모두의 연령 자료가 있어야 비교할 수 있습니다.</p>
            )}
          </div>
        </>
      ) : (
        <p className="two-region-empty">
          지도나 목록에서 다른 {levelLabel}을 선택하면 두 지역을 비교합니다.
        </p>
      )}
    </section>
  )
}
