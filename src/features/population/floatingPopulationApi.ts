import { API_BASE_URL } from '../../lib/apiConfig'

export type PopulationMapMetric =
  | 'registered'
  | 'floating'
  | 'residential'

export interface FloatingPopulationItem {
  regionCode: string
  regionName: string
  servicePopulation: number
  residentialPopulation: number
  workplacePopulation: number
  visitorPopulation: number
  source: string
}

export interface FloatingPopulationResponse {
  year: number
  month: number
  statsYm: string
  count: number
  items: FloatingPopulationItem[]
  meta: {
    source: string
    dataAvailable: boolean
    description: string
    aggregation: string
    usageNote: string
  }
}

export interface FloatingPopulationAvailabilityResponse {
  months: string[]
  firstMonth: string | null
  lastMonth: string | null
  meta: {
    source: string
    description: string
    usageNote: string
  }
}

export const POPULATION_MAP_METRICS: ReadonlyArray<{
  value: PopulationMapMetric
  label: string
  description: string
}> = [
  {
    value: 'registered',
    label: '주민등록 인구',
    description: '행정안전부 주민등록 인구',
  },
  {
    value: 'floating',
    label: '유동인구',
    description: '서비스인구 월평균',
  },
  {
    value: 'residential',
    label: '주거인구',
    description: '생활인구 중 주거인구 월평균',
  },
]

export async function fetchFloatingPopulation(
  year: number,
  month: number,
): Promise<FloatingPopulationResponse> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  })
  const response = await fetch(
    `${API_BASE_URL}/floating-population?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error('유동·주거인구 데이터를 불러오지 못했습니다.')
  }
  return (await response.json()) as FloatingPopulationResponse
}

export async function fetchFloatingPopulationAvailability(): Promise<FloatingPopulationAvailabilityResponse> {
  const response = await fetch(
    `${API_BASE_URL}/floating-population/availability`,
  )

  if (!response.ok) {
    throw new Error('유동·주거인구 제공기간을 불러오지 못했습니다.')
  }
  return (await response.json()) as FloatingPopulationAvailabilityResponse
}
