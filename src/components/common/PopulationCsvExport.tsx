import { useEffect, useRef, useState } from 'react'
import type { PopulationLevel } from '../../features/population/populationApi'
import { legalCodesForAdminSelection } from '../../features/boundaries/legalAdministrativeSelection'
import {
  MAX_EXPORT_MONTHS,
  POPULATION_EXPORT_FIELDS,
  downloadPopulationExport,
  fetchPopulationExportPreview,
  monthSpan,
  shiftStatsMonth,
  type PopulationExportField,
  type PopulationExportOptions,
  type PopulationExportPreview,
} from '../../features/population/populationExportApi'
import './PopulationCsvExport.css'

interface PopulationCsvExportProps {
  level: PopulationLevel
  regionCode: string
  regionOptions: Array<{ code: string; name: string }>
  administrativeRegions: Array<{ code: string; name: string }>
  statsYm: string
  availableMonths: string[]
}

const DEFAULT_FIELDS: PopulationExportField[] = [
  'population', 'malePopulation', 'femalePopulation', 'households',
]

// 기본 시작월은 기준월부터 최대 24개월 전(서버 제한)이고, 자료가 시작되는 달보다 이전으로 가지 않습니다.
const defaultFromYm = (availableMonths: string[], statsYm: string) => {
  const earliest = availableMonths[0] ?? statsYm
  const limited = shiftStatsMonth(statsYm, -(MAX_EXPORT_MONTHS - 1))
  return limited > earliest ? limited : earliest
}

const monthInputValue = (value: string) =>
  /^\d{6}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4)}` : ''

const statsMonthValue = (value: string) => value.replace('-', '')

export default function PopulationCsvExport({
  level,
  regionCode,
  regionOptions,
  administrativeRegions,
  statsYm,
  availableMonths,
}: PopulationCsvExportProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const regionPickerRef = useRef<HTMLDetailsElement>(null)
  const previewRequestRef = useRef(0)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedRegionCodes, setSelectedRegionCodes] = useState<string[]>(
    regionCode ? [regionCode] : [],
  )
  const [regionSearch, setRegionSearch] = useState('')
  const [administrativeFilter, setAdministrativeFilter] = useState('')
  // 기본 기간은 기준월부터 최대 24개월(서버 제한)이고, 자료가 시작되는 달보다 이전으로 가지 않습니다.
  const [fromYm, setFromYm] = useState(() => defaultFromYm(availableMonths, statsYm))
  const [toYm, setToYm] = useState(statsYm)
  const [fields, setFields] = useState<PopulationExportField[]>(DEFAULT_FIELDS)
  const [preview, setPreview] = useState<PopulationExportPreview | null>(null)
  const [busy, setBusy] = useState<'preview' | 'download' | null>(null)
  const [error, setError] = useState('')
  const firstMonth = availableMonths[0] ?? statsYm
  const lastMonth = availableMonths.at(-1) ?? statsYm
  const relatedLegalCodes = level === 'legal'
    ? legalCodesForAdminSelection(administrativeFilter)
    : null
  const visibleRegions = regionOptions.filter((region) =>
    (!relatedLegalCodes || relatedLegalCodes.has(region.code)) &&
    region.name.toLocaleLowerCase().includes(regionSearch.trim().toLocaleLowerCase()),
  )

  const clearPreview = () => {
    previewRequestRef.current += 1
    setPreview(null)
    setBusy((current) => current === 'preview' ? null : current)
    setError('')
  }

  const resetSelection = () => {
    const initialRegionCode =
      regionOptions.some((region) => region.code === regionCode)
        ? regionCode
        : (regionOptions[0]?.code ?? '')
    setSelectedRegionCodes(initialRegionCode ? [initialRegionCode] : [])
    setRegionSearch('')
    setAdministrativeFilter('')
    setFromYm(defaultFromYm(availableMonths, statsYm))
    setToYm(statsYm)
    setFields([...DEFAULT_FIELDS])
    if (regionPickerRef.current) regionPickerRef.current.open = false
  }

  const open = () => {
    clearPreview()
    resetSelection()
    setIsOpen(true)
    dialogRef.current?.showModal()
  }

  const changeField = (field: PopulationExportField) => {
    clearPreview()
    setFields((current) => current.includes(field)
      ? current.filter((item) => item !== field)
      : POPULATION_EXPORT_FIELDS
        .map((item) => item.id)
        .filter((item) => item === field || current.includes(item)))
  }

  const changeRegions = (codes: string[]) => {
    clearPreview()
    setSelectedRegionCodes(codes)
  }

  const options = (): PopulationExportOptions => ({
    level,
    scope: 'region',
    regionCodes: selectedRegionCodes,
    statsYm,
    fromYm,
    toYm,
    fields,
  })

  const periodValid = Boolean(
    selectedRegionCodes.length > 0 && fromYm && toYm &&
    fromYm >= firstMonth && toYm <= lastMonth && fromYm <= toYm &&
    monthSpan(fromYm, toYm) <= MAX_EXPORT_MONTHS,
  )
  const valid = fields.length > 0 && periodValid

  useEffect(() => {
    if (!isOpen || !valid) return
    const requestId = ++previewRequestRef.current
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setBusy('preview')
      try {
        const result = await fetchPopulationExportPreview({
          level,
          scope: 'region',
          regionCodes: selectedRegionCodes,
          statsYm,
          fromYm,
          toYm,
          fields,
        }, controller.signal)
        if (requestId === previewRequestRef.current) setPreview(result)
      } catch (cause) {
        if (requestId === previewRequestRef.current) {
          setPreview(null)
          setError(cause instanceof Error ? cause.message : '미리보기를 확인하지 못했습니다.')
        }
      } finally {
        if (requestId === previewRequestRef.current) setBusy(null)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
      previewRequestRef.current += 1
    }
  }, [isOpen, valid, level, selectedRegionCodes, statsYm, fromYm, toYm, fields])

  const download = async () => {
    if (!valid || !preview) return
    setBusy('download')
    setError('')
    try {
      await downloadPopulationExport(options())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CSV 파일을 내려받지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="population-export">
      <button
        type="button"
        className="population-export-open"
        onClick={open}
        disabled={!availableMonths.length || !regionOptions.length}
      >
        자료 내려받기
      </button>
      <dialog
        ref={dialogRef}
        className="population-export-dialog"
        aria-labelledby="population-export-title"
        onClose={() => {
          previewRequestRef.current += 1
          setIsOpen(false)
          resetSelection()
          setPreview(null)
          setBusy(null)
          setError('')
        }}
      >
        <div className="population-export-header">
          <div>
            <p>CSV 파일</p>
            <h2 id="population-export-title">인구 자료 내려받기</h2>
          </div>
          <button
            type="button"
            className="population-export-close"
            aria-label="자료 내려받기 창 닫기"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </div>

        <div className="population-export-body">
          <div className="population-export-selection">
              {level === 'legal' && administrativeRegions.length > 0 && (
                <label className="population-export-administrative-filter">
                  행정동으로 좁히기
                  <select
                    value={administrativeFilter}
                    disabled={busy === 'download'}
                    onChange={(event) => setAdministrativeFilter(event.target.value)}
                  >
                    <option value="">전체 행정동</option>
                    {administrativeRegions.map((region) => (
                      <option key={region.code} value={region.code}>{region.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="population-export-region-picker">
                <span className="population-export-region-label">
                  {level === 'legal' ? '법정동' : '행정동'}
                </span>
                <details ref={regionPickerRef}>
                  <summary>
                    {selectedRegionCodes.length === 0
                      ? '지역을 골라주세요'
                      : selectedRegionCodes.length === 1
                        ? regionOptions.find((region) => region.code === selectedRegionCodes[0])?.name ?? '1개 지역 선택'
                        : `${selectedRegionCodes.length}개 지역 선택`}
                  </summary>
                  <div className="population-export-region-menu">
                    <input
                      type="search"
                      aria-label="지역 이름 검색"
                      placeholder="지역 이름 검색"
                      value={regionSearch}
                      onChange={(event) => setRegionSearch(event.target.value)}
                    />
                    <div className="population-export-region-shortcuts">
                      <button
                        type="button"
                        disabled={busy === 'download' || visibleRegions.length === 0}
                        onClick={() => {
                          const visibleCodes = new Set(visibleRegions.map((region) => region.code))
                          changeRegions(regionOptions
                            .filter((region) => selectedRegionCodes.includes(region.code) || visibleCodes.has(region.code))
                            .map((region) => region.code))
                        }}
                      >목록 모두 선택</button>
                      <button type="button" disabled={busy === 'download'} onClick={() => changeRegions([])}>전체 선택 해제</button>
                    </div>
                    <div className="population-export-region-list">
                      {visibleRegions.map((region) => (
                        <label key={region.code}>
                          <input
                            type="checkbox"
                            checked={selectedRegionCodes.includes(region.code)}
                            disabled={busy === 'download'}
                            onChange={() => changeRegions(
                              selectedRegionCodes.includes(region.code)
                                ? selectedRegionCodes.filter((code) => code !== region.code)
                                : regionOptions
                                  .filter((option) => option.code === region.code || selectedRegionCodes.includes(option.code))
                                  .map((option) => option.code),
                            )}
                          />
                          {region.name}
                        </label>
                      ))}
                      {visibleRegions.length === 0 && <p>일치하는 지역이 없습니다.</p>}
                    </div>
                  </div>
                </details>
              </div>
              <div className="population-export-period">
                <label>
                  시작월
                  <input
                    type="month"
                    value={monthInputValue(fromYm)}
                    min={monthInputValue(firstMonth)}
                    max={monthInputValue(lastMonth)}
                    disabled={busy === 'download'}
                    onChange={(event) => {
                      clearPreview()
                      setFromYm(statsMonthValue(event.target.value))
                    }}
                  />
                </label>
                <label>
                  종료월
                  <input
                    type="month"
                    value={monthInputValue(toYm)}
                    min={monthInputValue(firstMonth)}
                    max={monthInputValue(lastMonth)}
                    disabled={busy === 'download'}
                    onChange={(event) => {
                      clearPreview()
                      setToYm(statsMonthValue(event.target.value))
                    }}
                  />
                </label>
              </div>
              <p className="population-export-period-hint">
                조회 가능한 기간: {monthInputValue(firstMonth)} ~ {monthInputValue(lastMonth)}
              </p>
          </div>

          <fieldset className="population-export-fields">
            <legend>포함할 항목</legend>
            <div className="population-export-field-grid">
              {POPULATION_EXPORT_FIELDS.map((field) => (
                <label key={field.id}>
                  <input
                    type="checkbox"
                    checked={fields.includes(field.id)}
                    disabled={busy === 'download'}
                    onChange={() => changeField(field.id)}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="population-export-note">
            한 줄에 지역 한 곳의 한 달 자료가 담깁니다. 저장되지 않은 달은 제외하고,
            계산할 수 없는 값은 빈칸으로 남깁니다. 연령 구성은 이번 파일에 포함되지 않습니다.
          </p>
          {!valid && <p className="population-export-error" role="alert">
            {fields.length === 0
              ? '항목을 하나 이상 골라주세요.'
              : selectedRegionCodes.length === 0
                ? '지역을 하나 이상 골라주세요.'
                : !fromYm || !toYm
                  ? '시작월과 종료월을 골라주세요.'
                  : fromYm > toYm
                    ? '시작월이 종료월보다 늦습니다.'
                    : monthSpan(fromYm, toYm) > MAX_EXPORT_MONTHS
                      ? `한 번에 내려받을 수 있는 기간은 최대 ${MAX_EXPORT_MONTHS}개월입니다.`
                      : '조회 가능한 기간 안에서 월을 골라주세요.'}
          </p>}
          {error && <p className="population-export-error" role="alert">{error}</p>}

          {valid && !preview && !error && (
            <p className="population-export-loading" role="status">
              <span aria-hidden="true" /> 미리보기를 불러오는 중…
            </p>
          )}

          {preview && (
            <div className="population-export-preview">
              <strong>미리보기 · 총 {preview.count}건</strong>
              <div className="population-export-table-wrap">
                <table>
                  <thead><tr>{preview.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                  <tbody>
                    {preview.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((value, column) => <td key={column}>{value ?? ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.count > 5 && <small>처음 5건만 보여줍니다.</small>}
            </div>
          )}
        </div>

        <div className="population-export-actions">
          <button type="button" onClick={download} disabled={!preview || !valid || busy !== null}>
            {busy === 'download' ? '파일 준비 중…' : 'CSV 내려받기'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
