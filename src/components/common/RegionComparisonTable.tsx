import { useMemo, useState } from 'react'
import type { AdminPopulationRegion } from '../../features/population/populationApi'

type SortKey = 'population' | 'increase' | 'decrease'

interface RegionComparisonTableProps {
  items: AdminPopulationRegion[]
  levelLabel: string
  selectedRegionCode: string
  onSelectRegion: (region: AdminPopulationRegion) => void
}

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'population', label: '인구 많은 순' },
  { value: 'increase', label: '전월 증가 순' },
  { value: 'decrease', label: '전월 감소 순' },
]

function getMonthlyChange(item: AdminPopulationRegion): number | null {
  return item.comparisons.previousMonth.change
}

function formatMonthlyComparison(item: AdminPopulationRegion): string {
  const { change, changeRate } = item.comparisons.previousMonth
  if (change === null || changeRate === null) return '전월 비교 없음'
  if (change === 0) return '전월과 동일'
  const sign = change > 0 ? '+' : ''
  return `전월 ${sign}${changeRate.toFixed(2)}% · ${sign}${change.toLocaleString()}명`
}

export default function RegionComparisonTable({
  items,
  levelLabel,
  selectedRegionCode,
  onSelectRegion,
}: RegionComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('population')

  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        if (sortKey === 'increase') {
          return (getMonthlyChange(right) ?? Number.NEGATIVE_INFINITY) -
            (getMonthlyChange(left) ?? Number.NEGATIVE_INFINITY)
        }
        if (sortKey === 'decrease') {
          return (getMonthlyChange(left) ?? Number.POSITIVE_INFINITY) -
            (getMonthlyChange(right) ?? Number.POSITIVE_INFINITY)
        }
        return right.population - left.population
      }),
    [items, sortKey],
  )

  return (
    <section className="region-ranking" aria-label={`${levelLabel} 지역 비교`}>
      <div className="region-ranking-heading">
        <div>
          <small>{levelLabel} 전체 비교</small>
          <h3>인구·면적 지역 비교</h3>
        </div>
        <div className="region-ranking-controls">
          <span>{items.length}개 지역</span>
          <label>
            <span className="sr-only">지역 비교 정렬 기준</span>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <ol className="region-ranking-list">
        {sortedItems.map((item, index) => {
          const change = getMonthlyChange(item)
          const changeClass = change === null || change === 0
            ? 'steady'
            : change > 0
              ? 'increase'
              : 'decrease'
          const selected = item.regionCode === selectedRegionCode
          return (
            <li key={item.regionCode}>
              <button
                type="button"
                className={selected ? 'selected' : ''}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelectRegion(item)}
              >
                <span className="region-rank">{index + 1}</span>
                <span className="region-ranking-name">
                  <strong>{item.regionName}</strong>
                  <small className="region-ranking-meta">
                    <span>면적 {item.areaKm2.toFixed(2)}㎢</span>
                    <span>밀도 {item.populationDensity.toLocaleString()}명/㎢</span>
                    <span className={`region-ranking-change ${changeClass}`}>
                      {formatMonthlyComparison(item)}
                    </span>
                  </small>
                </span>
                <span className="region-ranking-population">
                  <strong>{item.population.toLocaleString()}</strong>
                  <small>명</small>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
