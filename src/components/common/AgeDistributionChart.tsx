import { useState } from 'react'
import type { AgeDistributionItem } from '../../features/population/populationApi'

interface AgeDistributionChartProps {
  items: AgeDistributionItem[]
}

export default function AgeDistributionChart({
  items,
}: AgeDistributionChartProps) {
  const [activeAgeGroup, setActiveAgeGroup] = useState<string | null>(null)
  const activeItem = items.find((item) => item.ageGroup === activeAgeGroup)
  const maximum = Math.max(
    ...items.map((item) => item.population),
    1,
  )

  if (!items.length || items.every((item) => item.population === 0)) {
    return (
      <div className="chart-empty">
        연령대별 인구 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="age-chart" aria-label="10세 단위 연령별 인구 분포">
      <div className="age-chart-breakdown" aria-live="polite">
        {activeItem ? (
          <>
            <strong>{activeItem.ageGroup}</strong>
            <span className="male">
              남성 <b>{activeItem.malePopulation.toLocaleString()}명</b>
            </span>
            <span className="female">
              여성 <b>{activeItem.femalePopulation.toLocaleString()}명</b>
            </span>
          </>
        ) : (
          <span className="age-chart-hint">
            연령대 막대에 마우스를 올리면 남성·여성 인원 수를 볼 수 있습니다.
          </span>
        )}
      </div>
      {items.map((item) => {
        const maleWidth = (item.malePopulation / maximum) * 100
        const femaleWidth = (item.femalePopulation / maximum) * 100

        return (
          <div
            className={`age-chart-row ${activeAgeGroup === item.ageGroup ? 'active' : ''}`}
            key={item.ageGroup}
            tabIndex={0}
            aria-label={`${item.ageGroup} 남성 ${item.malePopulation.toLocaleString()}명, 여성 ${item.femalePopulation.toLocaleString()}명, 전체 ${item.population.toLocaleString()}명`}
            onMouseEnter={() => setActiveAgeGroup(item.ageGroup)}
            onMouseLeave={() => setActiveAgeGroup(null)}
            onFocus={() => setActiveAgeGroup(item.ageGroup)}
            onBlur={() => setActiveAgeGroup(null)}
          >
            <span className="age-label">{item.ageGroup}</span>

            <div className="age-bar-track">
              <span
                className="age-bar male"
                style={{ width: `${maleWidth}%` }}
              />
              <span
                className="age-bar female"
                style={{ width: `${femaleWidth}%` }}
              />
            </div>

            <strong className="age-value">
              {item.population.toLocaleString()}
            </strong>
          </div>
        )
      })}

      <div className="chart-legend">
        <span><i className="legend-dot male" />남성</span>
        <span><i className="legend-dot female" />여성</span>
      </div>
    </div>
  )
}
