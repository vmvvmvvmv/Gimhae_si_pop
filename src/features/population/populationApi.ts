import { API_BASE_URL } from '../../lib/apiConfig'

export interface AgeDistributionItem {
  ageGroup: string
  population: number
  malePopulation: number
  femalePopulation: number
}

export interface PopulationComparison {
  statsYm: string
  population: number | null
  change: number | null
  changeRate: number | null
}

export type PopulationLevel = 'admin' | 'legal'

export interface AdminPopulationRegion {
  regionCode: string
  regionName: string
  population: number
  households: number
  populationPerHousehold: number
  malePopulation: number
  femalePopulation: number
  areaKm2: number
  populationDensity: number
  areaSource?: 'SGIS' | 'VWORLD' | 'LOCAL_GEOJSON'
  areaReferenceYear?: number | null
  comparisons: {
    previousMonth: PopulationComparison
    previousYear: PopulationComparison
  }
  sourceRowCount: number
  ageDistribution: AgeDistributionItem[]
  ageSourceRowCount: number
}

export interface AdminPopulationResponse {
  level: PopulationLevel
  year: number
  month: number
  count: number
  items: AdminPopulationRegion[]
  meta: {
    source?: string
    dataAvailable?: boolean
    message?: string
    storedRegionCount?: number
    missingRegionCount?: number
    requestedRegionCount?: number
    failedRegionCount?: number
    noDataRegionCount?: number
    ageDataIncluded?: boolean
    areaSource?: 'SGIS' | 'VWORLD' | 'LOCAL_GEOJSON'
    areaReferenceYear?: number | null
    failedRegions?: Array<{
      regionCode: string
      regionName: string
      error: string
    }>
  }
}

export interface PopulationAvailabilityItem {
  level: PopulationLevel
  statsYm: string
  storedRegionCount: number
  expectedRegionCount: number
  complete: boolean
}

export interface PopulationAvailabilityResponse {
  items: PopulationAvailabilityItem[]
  levels: Record<
    PopulationLevel,
    {
      months: string[]
      minStatsYm: string | null
      maxStatsYm: string | null
      expectedRegionCount: number
      completeMonthCount: number
    }
  >
  meta: {
    source?: string
    description?: string
  }
}

export interface PopulationComparisonSnapshot {
  statsYm: string
  population: number
  households: number
  populationPerHousehold: number
}

export interface PopulationComparisonResponse {
  level: PopulationLevel
  regionCode: string
  regionName: string
  base: PopulationComparisonSnapshot | null
  target: PopulationComparisonSnapshot | null
  change: number | null
  changeRate: number | null
  meta: {
    source?: string
    dataAvailable?: boolean
  }
}

export interface PopulationTrendPoint {
  statsYm: string
  population: number
  households: number
  populationPerHousehold: number
}

export interface PopulationTrendResponse {
  level: PopulationLevel
  regionCode: string
  regionName: string
  count: number
  items: PopulationTrendPoint[]
  summary: {
    first: PopulationTrendPoint | null
    latest: PopulationTrendPoint | null
    minimum: PopulationTrendPoint | null
    maximum: PopulationTrendPoint | null
    change: number | null
    changeRate: number | null
  }
  meta: {
    source: string
    minStatsYm: string | null
    maxStatsYm: string | null
  }
}

export interface NationalDensityResponse {
  year: number
  month: number
  statsYm: string
  population: number
  areaKm2: number
  densityPerKm2: number
  meta: {
    populationSource?: string
    areaSource?: string
    areaNote?: string
  }
}

export interface SimilarDensityMatch {
  regionCode: string
  regionName: string
  areaKm2: number
  areaDifferenceKm2: number
  areaDifferenceRate: number
  population: number | null
  densityPerKm2: number | null
  populationDataAvailable: boolean
}

export interface SimilarDensityResponse {
  target: {
    regionCode: string
    regionName: string
    areaKm2: number
    population: number
    densityPerKm2: number | null
  }
  matches: SimilarDensityMatch[]
  comparison: {
    sampleCount: number
    averageDensityPerKm2: number | null
    targetToAverageRatio: number | null
  }
  meta: {
    source: string
    statsYm: string
    boundaryYear: number | null
    areaCandidateCount: number
    populationDataIncluded: boolean
    areaToleranceRate: number
    targetAreaSource: string
    message?: string
  }
}

export class LoginRequiredError extends Error {}

// 이 파일은 브라우저와 FastAPI 사이의 통신만 담당합니다. 화면 상태는 DashboardPage가 관리합니다.
export async function fetchPopulation(
  level: PopulationLevel,
  year: number,
  month: number,
): Promise<AdminPopulationResponse> {
  // FastAPI의 level/year/month 이름과 같게 URL 쿼리를 만듭니다.
  // 요청이 들어간 뒤에는 api/population.py → service → repository 순서로 갑니다.
  const params = new URLSearchParams({
    level,
    year: String(year),
    month: String(month),
  })

  const response = await fetch(
    `${API_BASE_URL}/population/regions?${params.toString()}`,
  )

  if (!response.ok) {
    let message = '인구 데이터를 불러오지 못했습니다.'

    try {
      const error = (await response.json()) as {
        detail?: string | { message?: string }
      }
      if (typeof error.detail === 'string') {
        message = error.detail
      } else if (error.detail?.message) {
        message = error.detail.message
      }
    } catch {
      // 서버 응답이 JSON이 아니면 기본 오류 메시지를 유지합니다.
    }

    throw new Error(message)
  }

  // 'as'는 TypeScript에게 응답 모양을 알려줄 뿐, 실행 중 검증을 하지는 않습니다.
  return (await response.json()) as AdminPopulationResponse
}

export function fetchAdminPopulation(
  year: number,
  month: number,
): Promise<AdminPopulationResponse> {
  return fetchPopulation('admin', year, month)
}

export async function fetchPopulationAvailability(): Promise<PopulationAvailabilityResponse> {
  // 실제 DB에 저장된 월을 먼저 알아야 빈 달을 기본값으로 선택하지 않습니다.
  const response = await fetch(`${API_BASE_URL}/population/availability`)

  if (response.status === 401) {
    throw new LoginRequiredError('로그인이 필요합니다.')
  }
  if (!response.ok) {
    throw new Error('조회 가능한 인구 데이터 기간을 불러오지 못했습니다.')
  }

  return (await response.json()) as PopulationAvailabilityResponse
}

export async function fetchPopulationComparison(
  level: PopulationLevel,
  regionCode: string,
  baseYm: string,
  targetYm: string,
): Promise<PopulationComparisonResponse> {
  const params = new URLSearchParams({
    level,
    region_code: regionCode,
    base_ym: baseYm,
    target_ym: targetYm,
  })
  const response = await fetch(
    `${API_BASE_URL}/population/comparison?${params.toString()}`,
  )

  if (!response.ok) {
    let message = '기준월 비교 데이터를 불러오지 못했습니다.'
    try {
      const error = (await response.json()) as {
        detail?: string
      }
      if (error.detail) {
        message = error.detail
      }
    } catch {
      // 응답이 JSON이 아니면 기본 오류 메시지를 유지합니다.
    }
    throw new Error(message)
  }

  return (await response.json()) as PopulationComparisonResponse
}

export async function fetchPopulationTrend(
  level: PopulationLevel,
  regionCode: string,
): Promise<PopulationTrendResponse> {
  const params = new URLSearchParams({
    level,
    region_code: regionCode,
  })
  const response = await fetch(
    `${API_BASE_URL}/population/trend?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error('장기 인구 추이를 불러오지 못했습니다.')
  }

  return (await response.json()) as PopulationTrendResponse
}

export async function fetchNationalDensity(
  year: number,
  month: number,
): Promise<NationalDensityResponse> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  })
  const response = await fetch(
    `${API_BASE_URL}/national-density?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error('전국 인구밀도 기준을 불러오지 못했습니다.')
  }

  return (await response.json()) as NationalDensityResponse
}

export async function fetchSimilarDensity(
  regionCode: string,
  year: number,
  month: number,
): Promise<SimilarDensityResponse> {
  // area_tolerance=0.1은 선택 지역 면적의 ±10% 범위를 뜻합니다.
  const params = new URLSearchParams({
    region_code: regionCode,
    year: String(year),
    month: String(month),
    limit: '10',
    area_tolerance: '0.1',
  })
  const response = await fetch(
    `${API_BASE_URL}/population/similar-density?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error('면적이 비슷한 지역의 인구밀도를 불러오지 못했습니다.')
  }

  return (await response.json()) as SimilarDensityResponse
}
