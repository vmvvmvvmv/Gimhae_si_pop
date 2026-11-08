import type { BoundaryType } from '../../features/boundaries/boundaryLoader'

export function BoundaryFilter({
  value,
  onChange,
}: {
  value: BoundaryType
  onChange: (next: BoundaryType) => void
}) {
  return (
    <div className="boundary-filter">
      <span className="filter-label">지역 구분</span>
      <div className="boundary-tabs" aria-label="지역 구분 선택">
        <button
          type="button"
          aria-pressed={value === 'administrative'}
          className={value === 'administrative' ? 'active' : ''}
          onClick={() => onChange('administrative')}
        >
          행정동
        </button>

        <button
          type="button"
          aria-pressed={value === 'legal'}
          className={value === 'legal' ? 'active' : ''}
          onClick={() => onChange('legal')}
        >
          법정동
        </button>
      </div>
    </div>
  )
}

export function PeriodFilters({
  years,
  year,
  months,
  month,
  loading,
  locked = false,
  isPartialMonth,
  onYearChange,
  onMonthChange,
}: {
  years: number[]
  year: number
  months: number[]
  month: number
  loading: boolean
  locked?: boolean
  isPartialMonth: (month: number) => boolean
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
}) {
  return (
    <>
      <label className="filter-field">
        <span>연도</span>
        <select
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
          disabled={loading || !years.length}
        >
          {locked && <option value={year}>로그인 후 선택</option>}
          {years.map((optionYear) => (
            <option key={optionYear} value={optionYear}>
              {optionYear}년
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>월</span>
        <select
          value={month}
          onChange={(event) => onMonthChange(Number(event.target.value))}
          disabled={loading || !months.length}
        >
          {locked && <option value={month}>로그인 후 선택</option>}
          {months.map((optionMonth) => (
            <option key={optionMonth} value={optionMonth}>
              {optionMonth}월{isPartialMonth(optionMonth) ? ' (일부)' : ''}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
