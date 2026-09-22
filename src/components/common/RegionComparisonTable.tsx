import { useMemo, useState } from 'react'
import type { AdminPopulationRegion } from '../../features/population/populationApi'

type SortKey = 'population' | 'area' | 'density'

interface RegionComparisonTableProps {
  items: AdminPopulationRegion[]
  levelLabel: string
}

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'population', label: '총인구순' },
  { value: 'density', label: '인구밀도순' },
  { value: 'area', label: '면적순' },
]

export default function RegionComparisonTable({
  items,
  levelLabel,
}: RegionComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('population')

  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        if (sortKey === 'area') {
          return right.areaKm2 - left.areaKm2
        }

        if (sortKey === 'density') {
          return right.populationDensity - left.populationDensity
        }

        return right.population - left.population
      }),
    [items, sortKey],
  )

  return (
    <section className="comparison-table-card">
      <div className="comparison-table-heading">
        <div>
          <span>지역 비교</span>
          <h2>{levelLabel} 면적·인구 비교</h2>
        </div>

        <label className="comparison-sort">
          <span>정렬 기준</span>
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

      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">순위</th>
              <th scope="col">지역</th>
              <th scope="col">총인구</th>
              <th scope="col">면적(㎢)</th>
              <th scope="col">인구밀도(명/㎢)</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item, index) => (
              <tr key={item.regionCode}>
                <td>{index + 1}</td>
                <th scope="row">{item.regionName}</th>
                <td>{item.population.toLocaleString()}명</td>
                <td>{item.areaKm2.toFixed(2)}</td>
                <td>{item.populationDensity.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
