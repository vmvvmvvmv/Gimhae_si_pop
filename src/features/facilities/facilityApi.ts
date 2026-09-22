import { API_BASE_URL } from '../../lib/apiConfig'

export type FacilityCategory =
  | 'ADMIN_CENTER'
  | 'HOSPITAL'
  | 'SCHOOL'
  | 'UNIVERSITY'
  | 'TRANSIT'
  | 'BRIDGE'
  | 'PARK'
  | 'MARKET'

export const FACILITY_OPTIONS: ReadonlyArray<{
  category: FacilityCategory
  label: string
}> = [
  { category: 'ADMIN_CENTER', label: '행정복지센터' },
  { category: 'HOSPITAL', label: '주요 의료' },
  { category: 'SCHOOL', label: '학교' },
  { category: 'UNIVERSITY', label: '대학교' },
  { category: 'TRANSIT', label: '교통거점' },
  { category: 'BRIDGE', label: '교량' },
  { category: 'PARK', label: '공원' },
  { category: 'MARKET', label: '시장·마트' },
]

export interface FacilityItem {
  id: number
  sourceId: string
  category: FacilityCategory
  name: string
  latitude: number
  longitude: number
  roadAddress: string | null
  parcelAddress: string | null
  phone: string | null
  source: string
  fetchedAt: string | null
}

export interface FacilityResponse {
  count: number
  items: FacilityItem[]
  meta: {
    source: string
    categories: FacilityCategory[]
  }
}

export async function fetchFacilities(
  categories: readonly FacilityCategory[],
): Promise<FacilityResponse> {
  const params = new URLSearchParams()
  categories.forEach((category) => params.append('category', category))
  const response = await fetch(
    `${API_BASE_URL}/facilities?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error('시설 정보를 불러오지 못했습니다.')
  }

  return (await response.json()) as FacilityResponse
}
