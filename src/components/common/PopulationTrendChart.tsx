import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  PopulationTrendPoint,
  PopulationTrendResponse,
} from '../../features/population/populationApi'

interface PopulationTrendChartProps {
  data: PopulationTrendResponse
}

const WIDTH = 540
const HEIGHT = 310
const PADDING = { top: 26, right: 24, bottom: 58, left: 82 }

function formatStatsYm(statsYm: string) {
  return `${statsYm.slice(0, 4)}.${statsYm.slice(4)}`
}

function makeTickIndexes(length: number, maximumTicks = 5) {
  if (length <= maximumTicks) {
    return Array.from({ length }, (_, index) => index)
  }

  return Array.from(
    new Set(
      Array.from({ length: maximumTicks }, (_, index) =>
        Math.round((index * (length - 1)) / (maximumTicks - 1)),
      ),
    ),
  )
}

function formatChange(change: number | null, changeRate: number | null) {
  if (change === null || changeRate === null) return '계산 불가'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toLocaleString()}명 (${sign}${changeRate.toFixed(2)}%)`
}

export default function PopulationTrendChart({
  data,
}: PopulationTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const items = data.items
  if (items.length < 2) {
    return <div className="chart-empty">인구 추이 데이터가 부족합니다.</div>
  }

  const populations = items.map((item) => item.population)
  const rawMinimum = Math.min(...populations)
  const rawMaximum = Math.max(...populations)
  const paddingValue = Math.max((rawMaximum - rawMinimum) * 0.08, 1)
  const minimum = Math.max(0, rawMinimum - paddingValue)
  const maximum = rawMaximum + paddingValue
  const chartWidth = WIDTH - PADDING.left - PADDING.right
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom
  const range = Math.max(maximum - minimum, 1)

  const getX = (index: number) =>
    PADDING.left + (index / (items.length - 1)) * chartWidth
  const getY = (item: PopulationTrendPoint) =>
    PADDING.top + ((maximum - item.population) / range) * chartHeight

  const linePath = items
    .map((item, index) =>
      `${index === 0 ? 'M' : 'L'} ${getX(index).toFixed(2)} ${getY(item).toFixed(2)}`,
    )
    .join(' ')
  const areaPath = `${linePath} L ${getX(items.length - 1).toFixed(2)} ${(PADDING.top + chartHeight).toFixed(2)} L ${getX(0).toFixed(2)} ${(PADDING.top + chartHeight).toFixed(2)} Z`
  const tickIndexes = makeTickIndexes(items.length)
  const hoveredItem = hoveredIndex === null ? null : items[hoveredIndex]
  const hoveredX = hoveredIndex === null ? 0 : getX(hoveredIndex)
  const hoveredY = hoveredItem ? getY(hoveredItem) : 0
  const tooltipWidth = 174
  const tooltipHeight = 66
  const tooltipX = Math.min(
    Math.max(hoveredX - tooltipWidth / 2, PADDING.left),
    WIDTH - PADDING.right - tooltipWidth,
  )
  const tooltipY = hoveredY < 82
    ? hoveredY + 14
    : hoveredY - tooltipHeight - 14

  const handlePointerMove = (
    event: ReactPointerEvent<SVGRectElement>,
  ) => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return

    const bounds = svg.getBoundingClientRect()
    const svgX = ((event.clientX - bounds.left) / bounds.width) * WIDTH
    const chartX = Math.min(
      Math.max(svgX, PADDING.left),
      WIDTH - PADDING.right,
    )
    const index = Math.round(
      ((chartX - PADDING.left) / chartWidth) * (items.length - 1),
    )
    setHoveredIndex(index)
  }

  return (
    <div className="trend-chart">
      <div className="trend-summary">
        <div>
          <small>전체 변화</small>
          <strong>
            {formatChange(data.summary.change, data.summary.changeRate)}
          </strong>
        </div>
        <div>
          <small>최고 인구</small>
          <strong>
            {data.summary.maximum?.population.toLocaleString() ?? '-'}명
          </strong>
          <span>
            {data.summary.maximum
              ? formatStatsYm(data.summary.maximum.statsYm)
              : '-'}
          </span>
        </div>
        <div>
          <small>최저 인구</small>
          <strong>
            {data.summary.minimum?.population.toLocaleString() ?? '-'}명
          </strong>
          <span>
            {data.summary.minimum
              ? formatStatsYm(data.summary.minimum.statsYm)
              : '-'}
          </span>
        </div>
      </div>

      <div className="trend-svg-wrap">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${data.regionName} 월별 인구 추이`}
        >
          <defs>
            <linearGradient id="trend-area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f66a9" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#2f66a9" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[maximum, (maximum + minimum) / 2, minimum].map((value) => {
            const y = PADDING.top + ((maximum - value) / range) * chartHeight
            return (
              <g key={value}>
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  className="trend-grid-line"
                />
                <text x={PADDING.left - 8} y={y + 4} className="trend-y-label">
                  {Math.round(value).toLocaleString()}
                </text>
              </g>
            )
          })}

          <path d={areaPath} fill="url(#trend-area-gradient)" />
          <path d={linePath} className="trend-line" />

          {tickIndexes.map((index) => (
            <text
              key={items[index].statsYm}
              x={getX(index)}
              y={HEIGHT - 9}
              className="trend-x-label"
            >
              {formatStatsYm(items[index].statsYm)}
            </text>
          ))}

          {hoveredItem && (
            <g className="trend-tooltip" pointerEvents="none">
              <line
                x1={hoveredX}
                x2={hoveredX}
                y1={PADDING.top}
                y2={PADDING.top + chartHeight}
                className="trend-hover-line"
              />
              <circle
                cx={hoveredX}
                cy={hoveredY}
                r="6"
                className="trend-hover-dot"
              />
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height={tooltipHeight}
                rx="8"
                className="trend-tooltip-box"
              />
              <text
                x={tooltipX + 12}
                y={tooltipY + 24}
                className="trend-tooltip-date"
              >
                {formatStatsYm(hoveredItem.statsYm)}
              </text>
              <text
                x={tooltipX + 12}
                y={tooltipY + 49}
                className="trend-tooltip-value"
              >
                {hoveredItem.population.toLocaleString()}명
              </text>
            </g>
          )}

          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={chartWidth}
            height={chartHeight}
            className="trend-hover-area"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoveredIndex(null)}
          />
        </svg>
      </div>
      <p className="trend-caption">
        {data.meta.minStatsYm ? formatStatsYm(data.meta.minStatsYm) : '-'}부터{' '}
        {data.meta.maxStatsYm ? formatStatsYm(data.meta.maxStatsYm) : '-'}까지{' '}
        {data.count.toLocaleString()}개월
      </p>
    </div>
  )
}
