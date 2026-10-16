import { describe, expect, it } from 'vitest'
import type { DevelopmentNotice } from './developmentApi'
import { getDevelopmentNoticeMatches } from './developmentMatching'

function notice(
  id: number,
  sourceId: string,
  title: string,
  summary: string | null = null,
): DevelopmentNotice {
  return {
    id,
    sourceId,
    title,
    summary,
    noticeNumber: String(id),
    noticeType: '고시',
    noticeDate: '2025-01-01',
    organizationName: '김해시',
    stage: 'DESIGNATED',
    stageLabel: '지정',
    source: 'GIMHAE_UPIS',
    sourceUrl: '',
    officialLinkStatus: 'PENDING',
    officialLinkStatusLabel: '확인 중',
    officialLinkMessage: '',
  }
}

describe('개발구역과 고시 연결', () => {
  it('식별자가 있으면 제목이나 요약의 이름보다 식별자 일치를 우선한다', () => {
    const notices = [
      notice(1, '48250NTC202501010001', '다른 지구단위계획구역 지정'),
      notice(2, '48250NTC202501010002', '진례시례지구 도시개발구역 고시'),
    ]

    expect(getDevelopmentNoticeMatches(
      '진례시례지구 도시개발구역',
      'PUBLIC_DEVELOPMENT',
      notices,
      '48250NTC202501010001',
    ).map((item) => item.id)).toEqual([1])
    expect(getDevelopmentNoticeMatches(
      '진례시례지구 도시개발구역',
      'PUBLIC_DEVELOPMENT',
      notices,
      '48250NTC202501010003',
    )).toEqual([])
  })

  it('요약에만 등장하는 구역명은 연결하지 않는다', () => {
    const notices = [
      notice(1, 'one', '다른 사업 변경 고시', '진례시례지구 도시개발구역과 인접'),
      notice(2, 'two', '진례시례지구 도시개발구역 지정 고시'),
    ]

    expect(getDevelopmentNoticeMatches(
      '진례시례지구 도시개발구역',
      'PUBLIC_DEVELOPMENT',
      notices,
    ).map((item) => item.id)).toEqual([2])
  })

  it('식별자가 없는 산업단지는 제목의 고유명과 산업단지 유형을 함께 확인한다', () => {
    const notices = [
      notice(1, 'one', '진영죽곡 일반산업단지 지정 고시'),
      notice(2, 'two', '진영죽곡 주변 도로 변경 고시'),
    ]

    expect(getDevelopmentNoticeMatches(
      '진영죽곡',
      'INDUSTRIAL_COMPLEX',
      notices,
    ).map((item) => item.id)).toEqual([1])
  })

  it('구분할 이름이 없는 지구단위계획은 추정 연결하지 않는다', () => {
    expect(getDevelopmentNoticeMatches(
      '제1종지구단위계획구역',
      'DISTRICT_PLAN',
      [notice(1, 'one', '제1종지구단위계획구역 변경 고시')],
    )).toEqual([])
  })

  it('숫자가 붙은 사업명은 다른 번호의 사업과 구분한다', () => {
    const notices = [
      notice(1, 'one', '김해구산2지구 개발사업 지정'),
      notice(2, 'two', '김해구산20지구 개발사업 지정'),
    ]

    expect(getDevelopmentNoticeMatches(
      '김해구산2',
      'PUBLIC_DEVELOPMENT',
      notices,
    ).map((item) => item.id)).toEqual([1])
  })
})
