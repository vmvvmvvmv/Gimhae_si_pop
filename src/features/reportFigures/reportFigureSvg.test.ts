import { describe, expect, it } from 'vitest'
import { buildReportFigure, buildReportFigureSvg } from './reportFigureSvg'
import type { GeoJsonCollection } from '../boundaries/boundaryLoader'

const boundary: GeoJsonCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { adm_nm: '경상남도 김해시 장유1동', adm_cd2: '4825052000' },
    geometry: {
      type: 'Polygon',
      coordinates: [[[128.74, 35.15], [128.88, 35.15], [128.88, 35.23], [128.74, 35.23], [128.74, 35.15]]],
    },
  }],
}

describe('지역 현황 지도 이미지', () => {
  it('김해시 행정동 두 곳을 선택하면 두 구역만 함께 그린다', () => {
    const boundaries: GeoJsonCollection = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { adm_nm: '경상남도 김해시 진영읍', adm_cd2: '4825025000' }, geometry: { type: 'Polygon', coordinates: [[[128.7, 35.3], [128.72, 35.3], [128.72, 35.32], [128.7, 35.32], [128.7, 35.3]]] } },
      { type: 'Feature', properties: { adm_nm: '경상남도 김해시 주촌면', adm_cd2: '4825032000' }, geometry: { type: 'Polygon', coordinates: [[[128.8, 35.2], [128.82, 35.2], [128.82, 35.22], [128.8, 35.22], [128.8, 35.2]]] } },
      { type: 'Feature', properties: { adm_nm: '경상남도 김해시 장유1동', adm_cd2: '4825061000' }, geometry: { type: 'Polygon', coordinates: [[[128.9, 35.1], [128.92, 35.1], [128.92, 35.12], [128.9, 35.12], [128.9, 35.1]]] } },
    ] }
    const figure = buildReportFigure({
      kind: 'administrative', boundaries, selectedRegionCodes: ['4825025000', '4825032000'],
      legalBoundaries: { type: 'FeatureCollection', features: [] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] }, facilities: [], radiusMeters: 500,
    })

    expect(figure.svg).toContain('>진영읍</text>')
    expect(figure.svg).toContain('>주촌면</text>')
    expect(figure.svg).not.toContain('>장유1동</text>')
    expect(figure.legend.map((item) => item.label)).toEqual(['진영읍', '주촌면', '법정동 경계'])
  })

  it('사이트의 법정동·개발구역 도형을 이용해 원본 이미지 없이 그린다', () => {
    const legal: GeoJsonCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { EMD_NM: '무계동' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[128.78, 35.17], [128.82, 35.17], [128.82, 35.2], [128.78, 35.2], [128.78, 35.17]]],
        },
      }],
    }
    const development: GeoJsonCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { category: 'DISTRICT_PLAN', categoryLabel: '지구단위계획' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[128.79, 35.18], [128.81, 35.18], [128.81, 35.19], [128.79, 35.19], [128.79, 35.18]]],
        },
      }],
    }
    const figure = buildReportFigure({
      kind: 'site-overview',
      boundaries: boundary,
      legalBoundaries: legal,
      developmentAreas: development,
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] },
      facilities: [],
      radiusMeters: 500,
    })
    const svg = figure.svg

    expect(figure.legend.map((item) => item.label)).toContain('무계동')
    expect(figure.legend.map((item) => item.label)).toContain('지구단위계획')
    expect(svg).toContain('fill="#d7e7bf"')
    expect(svg).toContain('fill="#e85a80"')
    expect(svg).toContain('clip-path="url(#selected-regions-clip)"')
    expect(svg).not.toContain('data:image/png')
  })

  it('사이트 시설 좌표에서 영향권을 계산한다', () => {
    const figure = buildReportFigure({
      kind: 'admin-access',
      boundaries: boundary,
      legalBoundaries: { type: 'FeatureCollection', features: [] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] },
      facilities: [{
        id: 1, sourceId: 'test', category: 'ADMIN_CENTER', name: '장유1동 행정복지센터',
        longitude: 128.8, latitude: 35.18, roadAddress: null, parcelAddress: null,
        phone: null, source: 'site-db', fetchedAt: null,
      }],
      radiusMeters: 1000,
    })
    const svg = figure.svg

    expect(figure.legend.map((item) => item.label)).toContain('행정복지센터 1개 지점')
    expect((svg.match(/<ellipse/g) ?? [])).toHaveLength(2)
    expect(svg).not.toContain('<image')
    expect(svg).not.toContain('>장유지역 행정복지센터 영향권</text>')
    expect(svg).not.toContain('>범례</text>')
  })

  it('초등학교만 골라 실제 시설 좌표에 500m와 750m 영향권을 그린다', () => {
    const facilities = ['장유초등학교', '장유중학교'].map((name, index) => ({
      id: index + 1, sourceId: String(index), category: 'SCHOOL' as const, name,
      longitude: 128.8 + index * 0.01, latitude: 35.18,
      roadAddress: null, parcelAddress: null, phone: null, source: 'site-db', fetchedAt: null,
    }))
    const figure = buildReportFigure({
      kind: 'elementary-access', boundaries: boundary,
      legalBoundaries: { type: 'FeatureCollection', features: [] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] }, facilities, radiusMeters: 500,
    })
    const svg = figure.svg

    expect(figure.legend.map((item) => item.label)).toContain('초등학교 1개 지점')
    expect(figure.legend.map((item) => item.label)).toContain('영향권 반경 500m·750m')
    expect((svg.match(/<ellipse/g) ?? [])).toHaveLength(2)
  })

  it('공식 공원 유형과 좌표로 영향권을 그리고 기존 시설 공원을 섞지 않는다', () => {
    const parks: GeoJsonCollection = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: '가람공원', parkType: '소공원', areaM2: 1000 }, geometry: { type: 'Point', coordinates: [128.80, 35.18] } },
      { type: 'Feature', properties: { name: '나무공원', parkType: '근린공원', areaM2: 15000 }, geometry: { type: 'Point', coordinates: [128.81, 35.18] } },
      { type: 'Feature', properties: { name: '큰공원', parkType: '근린공원', areaM2: 35000 }, geometry: { type: 'Point', coordinates: [128.82, 35.18] } },
    ] }
    const figure = buildReportFigure({
      kind: 'park-access', boundaries: boundary, parks,
      legalBoundaries: { type: 'FeatureCollection', features: [] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] },
      facilities: [{
        id: 1, sourceId: 'legacy', category: 'PARK', name: '기존공원',
        longitude: 128.82, latitude: 35.18, roadAddress: null, parcelAddress: null,
        phone: null, source: 'site-db', fetchedAt: null,
      }], radiusMeters: 1000,
    })
    const radii = [...figure.svg.matchAll(/<ellipse[^>]+rx="([\d.]+)"/g)].map((match) => Number(match[1]))

    expect(radii).toHaveLength(3)
    expect(radii[1]).toBeGreaterThan(radii[0])
    expect(radii[2]).toBeGreaterThan(radii[1])
    expect(figure.legend.map((item) => item.label)).toContain('소공원 영향권 1개')
    expect(figure.legend.map((item) => item.label)).toContain('근린공원 영향권 2개')
    expect(figure.svg).toContain('공공데이터포털 도시공원정보')
    expect(figure.svg).not.toContain('기존공원')
  })

  it('선택 지역 밖의 인접 공원 영향권도 경계 안에 표시한다', () => {
    const parks: GeoJsonCollection = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: '인접공원', parkType: '근린공원', areaM2: 35000 }, geometry: { type: 'Point', coordinates: [128.881, 35.18] } },
      { type: 'Feature', properties: { name: '먼공원', parkType: '근린공원', areaM2: 35000 }, geometry: { type: 'Point', coordinates: [128.92, 35.18] } },
    ] }
    const base = {
      boundaries: boundary, parks,
      legalBoundaries: { type: 'FeatureCollection', features: [] } as GeoJsonCollection,
      developmentAreas: { type: 'FeatureCollection', features: [] } as GeoJsonCollection,
      waterways: { type: 'FeatureCollection', features: [] } as GeoJsonCollection,
      roads: { type: 'FeatureCollection', features: [] } as GeoJsonCollection,
      facilities: [], radiusMeters: 500,
    }

    const accessSvg = buildReportFigure({ ...base, kind: 'park-access' }).svg
    expect((accessSvg.match(/<ellipse/g) ?? [])).toHaveLength(1)
    expect((accessSvg.match(/<circle/g) ?? [])).toHaveLength(0)
    expect((buildReportFigure({ ...base, kind: 'park-locations' }).svg.match(/<circle/g) ?? [])).toHaveLength(0)
  })

  it('원자료의 관리번호가 달라도 동일한 공원 지점은 한 번만 표시한다', () => {
    const park = { type: 'Feature' as const, properties: { name: '하손마을 쉼터', parkType: '소공원', areaM2: 1000 }, geometry: { type: 'Point', coordinates: [128.8, 35.18] } }
    const figure = buildReportFigure({
      kind: 'park-locations', boundaries: boundary,
      parks: { type: 'FeatureCollection', features: [{ ...park, id: 'one' }, { ...park, id: 'two' }] },
      legalBoundaries: { type: 'FeatureCollection', features: [] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] }, facilities: [], radiusMeters: 500,
    })

    expect((figure.svg.match(/<circle/g) ?? [])).toHaveLength(1)
    expect(figure.legend.map((item) => item.label)).toContain('소공원 1개')
  })

  it('사이트 인구 응답의 기준월과 수치로 행정동별 지도를 그린다', () => {
    const figure = buildReportFigure({
      kind: 'population-choropleth', boundaries: boundary,
      legalBoundaries: { type: 'FeatureCollection', features: [] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] }, facilities: [], radiusMeters: 500,
      population: { statsYm: '202512', items: [{ regionCode: '4825052000', regionName: '장유1동', population: 67731 }] },
    })
    const svg = figure.svg

    expect(svg).toContain('67,731명')
    expect(svg).toContain('2025년 12월')
    expect(svg).toContain('장유1동')
    expect(figure.legend).toContainEqual({ color: '#fee8c8', label: '장유1동 67,731명' })
  })

  it('도로 현황은 사이트 도로선을 눈에 보이는 색으로 표시한다', () => {
    const figure = buildReportFigure({
      kind: 'roads', boundaries: boundary,
      legalBoundaries: { type: 'FeatureCollection', features: [] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [{
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[128.78, 35.18], [128.84, 35.18]] },
      }] }, facilities: [], radiusMeters: 500,
    })
    const svg = figure.svg

    expect(svg).toContain('stroke="#ed6846"')
    expect(figure.legend.map((item) => item.label)).toContain('사이트 보유 주요 도로')
    expect(svg).not.toContain('영향권은 직선거리')
  })

  it('행정구역 현황은 사이트 법정동 경계와 이름을 다시 그린다', () => {
    const svg = buildReportFigureSvg({
      kind: 'administrative', boundaries: boundary,
      legalBoundaries: { type: 'FeatureCollection', features: [{
        type: 'Feature', properties: { EMD_NM: '무계동' },
        geometry: { type: 'Polygon', coordinates: [[[128.78, 35.17], [128.82, 35.17], [128.82, 35.2], [128.78, 35.2], [128.78, 35.17]]] },
      }] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] }, facilities: [], radiusMeters: 500,
    })

    expect(svg).toContain('>무계동</text>')
    expect(svg).toContain('stroke="#6d7067"')
  })

  it('범례를 지도 이미지와 분리해 반환한다', () => {
    const result = buildReportFigure({
      kind: 'admin-access', boundaries: boundary,
      legalBoundaries: { type: 'FeatureCollection', features: [] },
      developmentAreas: { type: 'FeatureCollection', features: [] },
      waterways: { type: 'FeatureCollection', features: [] },
      roads: { type: 'FeatureCollection', features: [] },
      facilities: [{
        id: 1, sourceId: 'test', category: 'ADMIN_CENTER', name: '장유1동 행정복지센터',
        longitude: 128.8, latitude: 35.18, roadAddress: null, parcelAddress: null,
        phone: null, source: 'site-db', fetchedAt: null,
      }], radiusMeters: 1000,
    })

    expect(result.legend.map((item) => item.label)).toContain('행정복지센터 1개 지점')
    expect(result.svg).not.toContain('행정복지센터 1개 지점')
    expect(result.svg).not.toContain('x="974"')
    expect(result.svg).toContain('자료:')
  })
})
