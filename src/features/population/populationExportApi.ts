import { API_BASE_URL } from '../../lib/apiConfig'
import type { PopulationLevel } from './populationApi'

export const POPULATION_EXPORT_FIELDS = [
  { id: 'population', label: '총인구' },
  { id: 'malePopulation', label: '남성 인구' },
  { id: 'femalePopulation', label: '여성 인구' },
  { id: 'households', label: '세대 수' },
  { id: 'populationPerHousehold', label: '세대당 인구' },
  { id: 'areaKm2', label: '면적' },
  { id: 'populationDensity', label: '인구밀도' },
  { id: 'previousMonthChange', label: '전월 대비 증감' },
  { id: 'previousMonthChangeRate', label: '전월 대비 증감률' },
] as const

export type PopulationExportField = (typeof POPULATION_EXPORT_FIELDS)[number]['id']

export interface PopulationExportOptions {
  level: PopulationLevel
  scope: 'region' | 'month'
  regionCodes: string[]
  statsYm: string
  fromYm: string
  toYm: string
  fields: PopulationExportField[]
}

export interface PopulationExportPreview {
  columns: string[]
  rows: Array<Array<string | number | null>>
  count: number
}

export function populationExportParams(options: PopulationExportOptions): URLSearchParams {
  const params = new URLSearchParams({
    level: options.level,
    scope: options.scope,
  })
  if (options.scope === 'region') {
    options.regionCodes.forEach((code) => params.append('region_codes', code))
    params.set('from_ym', options.fromYm)
    params.set('to_ym', options.toYm)
  } else {
    params.set('stats_ym', options.statsYm)
  }
  options.fields.forEach((field) => params.append('fields', field))
  return params
}

async function exportError(response: Response): Promise<Error> {
  try {
    const result = (await response.json()) as { detail?: string }
    if (result.detail) return new Error(result.detail)
  } catch {
    // JSON 오류 본문이 없으면 공통 문구를 사용합니다.
  }
  return new Error('인구 자료를 불러오지 못했습니다.')
}

export async function fetchPopulationExportPreview(
  options: PopulationExportOptions,
  signal?: AbortSignal,
): Promise<PopulationExportPreview> {
  const response = await fetch(
    `${API_BASE_URL}/population/export/preview?${populationExportParams(options)}`,
    { signal },
  )
  if (!response.ok) throw await exportError(response)
  return (await response.json()) as PopulationExportPreview
}

export async function downloadPopulationExport(
  options: PopulationExportOptions,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/population/export.csv?${populationExportParams(options)}`,
  )
  if (!response.ok) throw await exportError(response)

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const period = options.scope === 'month'
    ? options.statsYm
    : `${options.fromYm}-${options.toYm}`
  link.href = objectUrl
  link.download = `gimhae_population_${options.level}_${options.scope}_${period}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
