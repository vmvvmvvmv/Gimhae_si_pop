import type { ReportFigureKind } from './reportFigureSvg'

export type ReportFigureOption = {
  id: string
  label: string
  kind: ReportFigureKind | null
  source: string
  missingSource?: string
  focusRegion?: string
}

export const REPORT_FIGURES: ReportFigureOption[] = [
  { id: 'overview', label: '사이트 자료 종합 현황도', kind: 'site-overview', source: '사이트 법정동·개발구역·하천·도로 · 공공데이터포털 도시공원정보(2026-05-04)' },
  { id: '1-1', label: '행정동·법정동 경계', kind: 'administrative', source: '사이트 행정동·법정동 경계' },
  { id: '1-2', label: '행정동별 인구', kind: 'population-choropleth', source: '사이트 저장 인구 DB' },
  { id: '1-3', label: '장유지역 인구분포', kind: null, source: '', missingSource: '100m 인구 격자 원자료가 사이트에 없습니다.' },
  { id: '1-6', label: '장유지역 미래 인구 추계', kind: null, source: '', missingSource: '장래 인구 추계 수치와 산정 모형이 사이트에 없습니다.' },
  { id: '1-7', label: '장유지역 유치원 위치 및 개소', kind: null, source: '', missingSource: '유치원별 위치·유형 자료가 사이트 시설 DB에 없습니다.' },
  { id: '1-8', label: '장유지역 유치원 영향권', kind: null, source: '', missingSource: '유치원별 위치와 영향권 기준 원자료가 사이트에 없습니다.' },
  { id: '1-9', label: '초등학교 위치', kind: 'elementary-locations', source: '사이트 초등학교 시설 좌표' },
  { id: '1-10', label: '초등학교 영향권', kind: 'elementary-access', source: '사이트 초등학교 시설 좌표 · 직선거리 500m·750m' },
  { id: '1-11', label: '공원 위치', kind: 'park-locations', source: '공공데이터포털 도시공원정보(2026-05-04) · 공원구분·좌표' },
  { id: '1-12', label: '공원 영향권', kind: 'park-access', source: '공공데이터포털 도시공원정보(2026-05-04) · 공원구분·면적에 따른 직선거리 반경' },
  { id: '1-13', label: '장유지역 토지피복도', kind: null, source: '', missingSource: '토지피복 분류 폴리곤 원자료가 사이트에 없습니다. 위의 사이트 자료 종합 현황도를 대체 자료로 볼 수 있습니다.' },
  { id: '1-14', label: '하천 현황', kind: 'waterways', source: '사이트 하천 폴리곤 · 자연요소 중 하천만 표현' },
  { id: '1-15', label: '주요 도로 현황', kind: 'roads', source: '사이트 주요 도로 중심선 · 전체 도로망과 등급은 미포함' },
  { id: '1-16', label: '행정복지센터 위치', kind: 'admin-locations', source: '사이트 행정복지센터 시설 좌표' },
  { id: '1-17', label: '행정복지센터 영향권', kind: 'admin-access', source: '사이트 행정복지센터 시설 좌표 · 직선거리 500m·1000m' },
  { id: '1-18', label: '인구대비 총 민원수 변화', kind: null, source: '', missingSource: '연도별 총 민원수 원자료가 사이트에 없습니다.' },
  { id: '2-2', label: '장유1동 현황', kind: 'administrative', focusRegion: '장유1동', source: '사이트 장유1동 현재 경계·법정동 자료' },
  { id: '2-3', label: '장유1동 분동안 경계 (안1)', kind: null, source: '', missingSource: '장유1동 개편안 경계 GeoJSON이 사이트에 없습니다.' },
  { id: '2-4', label: '장유1동 분동안 경계 (안2)', kind: null, source: '', missingSource: '장유1동 개편안 경계 GeoJSON이 사이트에 없습니다.' },
  { id: '2-5', label: '장유2동 현황', kind: 'administrative', focusRegion: '장유2동', source: '사이트 장유2동 현재 경계·법정동 자료' },
  { id: '2-6', label: '장유2동 경계구역 조정안', kind: null, source: '', missingSource: '장유2동 개편안 경계 GeoJSON이 사이트에 없습니다.' },
  { id: '2-7', label: '장유3동 현황', kind: 'administrative', focusRegion: '장유3동', source: '사이트 장유3동 현재 경계·법정동 자료' },
  { id: '2-8', label: '장유3동 분동안 경계 (안1)', kind: null, source: '', missingSource: '장유3동 개편안 경계 GeoJSON이 사이트에 없습니다.' },
  { id: '2-9', label: '장유3동 분동안 경계 (안2)', kind: null, source: '', missingSource: '장유3동 개편안 경계 GeoJSON이 사이트에 없습니다.' },
  { id: '2-10', label: '장유1동·장유3동 일부 분리 최종 4개동 개편안', kind: null, source: '', missingSource: '최종 개편안 경계 GeoJSON이 사이트에 없습니다.' },
]
