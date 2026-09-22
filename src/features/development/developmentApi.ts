import { API_BASE_URL } from '../../lib/apiConfig'

export interface DevelopmentNotice {
  id: number
  sourceId: string
  noticeNumber: string
  title: string
  noticeType: string
  noticeDate: string
  organizationName: string | null
  summary: string | null
  stage: string
  stageLabel: string
  source: string
  sourceUrl: string
}

export interface DevelopmentNoticeResponse {
  count: number
  items: DevelopmentNotice[]
  meta: {
    source: string
    originalSource: string
    areaName: string | null
  }
}

export async function fetchDevelopmentNotices(): Promise<DevelopmentNoticeResponse> {
  const response = await fetch(`${API_BASE_URL}/development/notices?limit=2000`)

  if (!response.ok) {
    throw new Error('김해시 UPIS 개발 고시를 불러오지 못했습니다.')
  }

  return (await response.json()) as DevelopmentNoticeResponse
}
