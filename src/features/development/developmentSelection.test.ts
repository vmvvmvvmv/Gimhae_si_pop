import { describe, expect, it } from 'vitest'
import type { GeoJsonCollection } from '../boundaries/boundaryLoader'
import type { DevelopmentNotice } from './developmentApi'
import { resolveSelectedDevelopmentAreas } from './developmentMatching'

const areas: GeoJsonCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        areaSourceId: 'area-a',
        noticeSourceId: 'notice-a',
        name: '첫 번째 구역',
        category: 'DISTRICT_PLAN',
        categoryLabel: '지구단위계획',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    },
    {
      type: 'Feature',
      properties: {
        areaSourceId: 'area-b',
        noticeSourceId: 'notice-b',
        name: '두 번째 구역',
        category: 'DISTRICT_PLAN',
        categoryLabel: '지구단위계획',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    },
  ],
}

function notice(id: number, sourceId: string): DevelopmentNotice {
  return {
    id,
    sourceId,
    noticeNumber: String(id),
    title: `${id}번 고시`,
    noticeType: '고시',
    noticeDate: '2025-01-01',
    organizationName: '김해시',
    summary: null,
    stage: 'DESIGNATED',
    stageLabel: '지정',
    source: 'GIMHAE_UPIS',
    sourceUrl: '',
    officialLinkStatus: 'PENDING',
    officialLinkStatusLabel: '확인 중',
    officialLinkMessage: '',
  }
}

describe('선택한 개발구역 상세', () => {
  it('구역을 먼저 선택해도 고시 응답이 도착하면 같은 ID의 상세가 갱신된다', () => {
    const selectedIds = ['area-a']
    const before = resolveSelectedDevelopmentAreas(selectedIds, areas, [])
    const after = resolveSelectedDevelopmentAreas(
      selectedIds,
      areas,
      [notice(1, 'notice-a')],
    )

    expect(before[0]).toMatchObject({ sourceId: 'area-a', notices: [] })
    expect(after[0].notices.map((item) => item.id)).toEqual([1])
  })

  it('겹친 구역의 선택 순서를 유지하며 각각의 고시만 연결한다', () => {
    const selected = resolveSelectedDevelopmentAreas(
      ['area-b', 'area-a'],
      areas,
      [notice(1, 'notice-a'), notice(2, 'notice-b')],
    )

    expect(selected.map((area) => area.sourceId)).toEqual(['area-b', 'area-a'])
    expect(selected.map((area) => area.notices[0].id)).toEqual([2, 1])
  })
})
