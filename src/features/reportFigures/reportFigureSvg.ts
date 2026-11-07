import type { FacilityItem } from '../facilities/facilityApi'
import type { GeoJsonCollection, GeoJsonFeature } from '../boundaries/boundaryLoader'

export type ReportFigureKind =
  | 'site-overview' | 'administrative' | 'population-choropleth'
  | 'elementary-locations' | 'elementary-access'
  | 'park-locations' | 'park-access'
  | 'waterways' | 'roads' | 'admin-locations' | 'admin-access'

type PopulationFigureData = {
  statsYm: string
  items: Array<{ regionCode: string; regionName: string; population: number }>
}

export interface ReportFigureInput {
  kind: ReportFigureKind
  boundaries: GeoJsonCollection
  legalBoundaries: GeoJsonCollection
  developmentAreas: GeoJsonCollection
  waterways: GeoJsonCollection
  roads: GeoJsonCollection
  parks?: GeoJsonCollection
  facilities: FacilityItem[]
  radiusMeters: number
  population?: PopulationFigureData
  focusRegion?: string
  selectedRegionCodes?: readonly string[]
}

export type ReportFigureLegendItem = { color: string; label: string }
export type ReportFigure = { svg: string; legend: ReportFigureLegendItem[] }

type Coordinate = [number, number]
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

const WIDTH = 1200
const HEIGHT = 820
const MAP = { left: 36, top: 36, width: 1128, height: 715 }
const LEGAL_COLORS = [
  '#d7e7bf', '#f5dfb2', '#d9e7c9', '#f2cfbe', '#e8d9ae', '#d1e2ee',
  '#d9d2ef', '#f4ddc1', '#c9e1cf', '#f0d4df', '#dce4c6', '#e6e0ca',
]
const DEVELOPMENT_COLORS: Record<string, { label: string; color: string }> = {
  INDUSTRIAL_COMPLEX: { label: '산업단지', color: '#eb7a45' },
  DISTRICT_PLAN: { label: '지구단위계획', color: '#e85a80' },
  PUBLIC_DEVELOPMENT: { label: '공공개발', color: '#f3a72f' },
  DEVELOPMENT_PROMOTION: { label: '개발촉진', color: '#ab7ac4' },
}
const REGION_COLORS = ['#e9be73', '#95baaa', '#d9a8b7']
const PARK_COLORS: Record<string, string> = {
  어린이공원: '#18a364', 소공원: '#75b85c', 근린공원: '#167a55',
  수변공원: '#388ec3', 체육공원: '#ba8244', 문화공원: '#a774b5', 역사공원: '#8c6e57',
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] ?? character)
}

function coordinate(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const [x, y] = value
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    ? [x, y] : null
}

function collectCoordinates(value: unknown, result: Coordinate[]): void {
  const pair = coordinate(value)
  if (pair) { result.push(pair); return }
  if (Array.isArray(value)) value.forEach((item) => collectCoordinates(item, result))
}

function boundsOf(features: GeoJsonFeature[]): Bounds {
  const points: Coordinate[] = []
  features.forEach((feature) => collectCoordinates(feature.geometry.coordinates, points))
  if (!points.length) throw new Error('선택한 행정동 경계를 찾지 못했습니다.')
  return {
    minX: Math.min(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxX: Math.max(...points.map(([x]) => x)),
    maxY: Math.max(...points.map(([, y]) => y)),
  }
}

function project(bounds: Bounds, [lon, lat]: Coordinate): Coordinate {
  const spanX = bounds.maxX - bounds.minX
  const spanY = bounds.maxY - bounds.minY
  const scale = Math.min(MAP.width / spanX, MAP.height / spanY)
  const xOffset = MAP.left + (MAP.width - spanX * scale) / 2
  const yOffset = MAP.top + (MAP.height - spanY * scale) / 2
  return [xOffset + (lon - bounds.minX) * scale, yOffset + (bounds.maxY - lat) * scale]
}

function pathFor(feature: GeoJsonFeature, bounds: Bounds): string {
  const geometry = feature.geometry
  const polygon = geometry.type === 'Polygon' ? [geometry.coordinates] :
    geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  const line = geometry.type === 'LineString' ? [geometry.coordinates] :
    geometry.type === 'MultiLineString' ? geometry.coordinates : []
  const parts: string[] = []
  for (const poly of polygon as unknown[]) {
    if (!Array.isArray(poly)) continue
    for (const ring of poly) {
      if (!Array.isArray(ring)) continue
      const coords = ring.map(coordinate).filter((pair): pair is Coordinate => pair !== null)
      if (coords.length < 3) continue
      parts.push(coords.map((pair, index) => {
        const [x, y] = project(bounds, pair)
        return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ') + ' Z')
    }
  }
  for (const segment of line as unknown[]) {
    if (!Array.isArray(segment)) continue
    const coords = segment.map(coordinate).filter((pair): pair is Coordinate => pair !== null)
    if (coords.length < 2) continue
    parts.push(coords.map((pair, index) => {
      const [x, y] = project(bounds, pair)
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' '))
  }
  return parts.join(' ')
}

function adminName(feature: GeoJsonFeature): string {
  return String(feature.properties.adm_nm ?? '').split(/\s+/).at(-1) ?? ''
}

function insideRing([x, y]: Coordinate, ring: unknown): boolean {
  if (!Array.isArray(ring)) return false
  const points = ring.map(coordinate).filter((pair): pair is Coordinate => pair !== null)
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function insideFeature(point: Coordinate, feature: GeoJsonFeature): boolean {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] :
    feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : []
  return (polygons as unknown[]).some((polygon) => {
    if (!Array.isArray(polygon) || !polygon.length || !insideRing(point, polygon[0])) return false
    return !polygon.slice(1).some((hole) => insideRing(point, hole))
  })
}

function withinRadiusOfFeature(point: Coordinate, feature: GeoJsonFeature, radiusMeters: number): boolean {
  if (insideFeature(point, feature)) return true
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] :
    feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : []
  const longitudeScale = 111320 * Math.cos(point[1] * Math.PI / 180)
  return (polygons as unknown[]).some((polygon) => Array.isArray(polygon) && polygon.some((ring) => {
    if (!Array.isArray(ring)) return false
    const points = ring.map(coordinate).filter((pair): pair is Coordinate => pair !== null)
    return points.some((start, index) => {
      const end = points[(index + 1) % points.length]
      const ax = (start[0] - point[0]) * longitudeScale
      const ay = (start[1] - point[1]) * 111320
      const dx = (end[0] - start[0]) * longitudeScale
      const dy = (end[1] - start[1]) * 111320
      const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
      return (ax + fraction * dx) ** 2 + (ay + fraction * dy) ** 2 <= radiusMeters ** 2
    })
  }))
}

function parkRadius(parkType: string, areaM2: number, defaultRadius: number): number {
  if (parkType === '소공원' || parkType === '어린이공원') return 250
  if (parkType === '근린공원') return areaM2 >= 30000 ? 1000 : 500
  if (parkType === '수변공원' || parkType === '체육공원') return 1000
  return defaultRadius
}

export function buildReportFigure(input: ReportFigureInput): ReportFigure {
  if (input.kind.startsWith('park-') && !input.parks) throw new Error('공식 도시공원 자료가 없습니다.')
  const selectedCodes = input.selectedRegionCodes ? new Set(input.selectedRegionCodes) : null
  const regions = input.boundaries.features.filter((feature) => {
    const name = String(feature.properties.adm_nm ?? '')
    return selectedCodes ? selectedCodes.has(String(feature.properties.adm_cd2 ?? '')) :
      /장유[123]동/.test(name) && (!input.focusRegion || name.includes(input.focusRegion))
  })
  const bounds = boundsOf(regions)
  const officialParks = (input.parks?.features ?? []).flatMap((feature) => {
    const point = feature.geometry.type === 'Point' ? coordinate(feature.geometry.coordinates) : null
    const name = String(feature.properties.name ?? '')
    if (!point || !name) return []
    return [{ name, longitude: point[0], latitude: point[1],
      parkType: String(feature.properties.parkType ?? ''), areaM2: Number(feature.properties.areaM2 ?? 0) }]
  })
  const boundaryPaths = regions.map((feature) => pathFor(feature, bounds)).filter(Boolean)
  const clip = `<clipPath id="selected-regions-clip">${boundaryPaths.map((d) => `<path d="${d}" fill-rule="evenodd"/>`).join('')}</clipPath>`
  const populationByCode = new Map(input.population?.items.map((item) => [item.regionCode, item.population]) ?? [])
  const populationValues = regions.map((feature) => populationByCode.get(String(feature.properties.adm_cd2 ?? '')))
    .filter((value): value is number => value !== undefined)
  if (input.kind === 'population-choropleth' && !populationValues.length) throw new Error('선택한 기준월의 인구 자료가 없습니다.')
  const minPopulation = Math.min(...populationValues)
  const maxPopulation = Math.max(...populationValues)
  const populationColor = (value: number | undefined): string => {
    if (value === undefined) return '#ece9d7'
    const fraction = (value - minPopulation) / Math.max(1, maxPopulation - minPopulation)
    const palette = ['#fee8c8', '#fdbb84', '#fc8d59', '#e34a33', '#b30000']
    return palette[Math.min(4, Math.floor(fraction * 4))]
  }
  const layers: string[] = [
    `<rect x="${MAP.left}" y="${MAP.top}" width="${MAP.width}" height="${MAP.height}" fill="#fff"/>`,
    ...regions.map((feature, index) => {
      const d = pathFor(feature, bounds)
      const value = populationByCode.get(String(feature.properties.adm_cd2 ?? ''))
      const fill = input.kind === 'population-choropleth' ? populationColor(value) :
        input.kind === 'administrative' ? REGION_COLORS[index % REGION_COLORS.length] : '#ece9d7'
      return `<path d="${d}" fill="${fill}" stroke="#9d9c90" stroke-width="1.4" fill-rule="evenodd"/>`
    }),
  ]
  const legend: ReportFigureLegendItem[] = []

  if (input.kind === 'site-overview') {
    const legal = input.legalBoundaries.features.filter((feature) => {
      const box = boundsOf([feature])
      const center: Coordinate = [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2]
      return regions.some((region) => insideFeature(center, region))
    })
    layers.push(`<g clip-path="url(#selected-regions-clip)">${legal.map((feature, index) => {
      return `<path d="${pathFor(feature, bounds)}" fill="${LEGAL_COLORS[index % LEGAL_COLORS.length]}" stroke="#fff" stroke-width="1.4" fill-rule="evenodd"/>`
    }).join('')}${input.developmentAreas.features.map((feature) => {
      const category = String(feature.properties.category ?? '')
      const style = DEVELOPMENT_COLORS[category]
      return style ? `<path d="${pathFor(feature, bounds)}" fill="${style.color}" fill-opacity="0.85" stroke="${style.color}" stroke-width="0.7" fill-rule="evenodd"/>` : ''
    }).join('')}</g>`)
    legal.forEach((feature, index) => legend.push({ color: LEGAL_COLORS[index % LEGAL_COLORS.length], label: String(feature.properties.EMD_NM ?? '') }))
    Object.values(DEVELOPMENT_COLORS).forEach(({ label, color }) => legend.push({ color, label }))
  }

  if (input.kind === 'administrative') {
    regions.forEach((feature, index) => {
      legend.push({ color: REGION_COLORS[index % REGION_COLORS.length], label: adminName(feature) })
    })
    const legal = input.legalBoundaries.features.filter((feature) => {
      const box = boundsOf([feature])
      const center: Coordinate = [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2]
      return regions.some((region) => insideFeature(center, region))
    })
    layers.push(`<g clip-path="url(#selected-regions-clip)">${legal.map((feature) => `<path d="${pathFor(feature, bounds)}" fill="none" stroke="#6d7067" stroke-width="1.1"/>`).join('')}</g>`)
    legal.forEach((feature) => {
      const box = boundsOf([feature])
      const [x, y] = project(bounds, [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2])
      layers.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="12" fill="#45534a" paint-order="stroke" stroke="#fff" stroke-width="2">${escapeXml(String(feature.properties.EMD_NM))}</text>`)
    })
    legend.push({ color: '#6d7067', label: '법정동 경계' })
  }

  if (input.kind === 'population-choropleth') {
    regions.forEach((feature) => {
      const value = populationByCode.get(String(feature.properties.adm_cd2 ?? ''))
      const name = adminName(feature)
      if (value !== undefined) legend.push({ color: populationColor(value), label: `${name} ${value.toLocaleString('ko-KR')}명` })
    })
  }

  const showWaterways = input.kind !== 'roads' && input.kind !== 'population-choropleth'
  const showRoads = input.kind !== 'waterways' && input.kind !== 'population-choropleth'
  layers.push(`<g clip-path="url(#selected-regions-clip)">${(showWaterways ? input.waterways.features : []).map((feature) => {
    const d = pathFor(feature, bounds)
    return d ? `<path d="${d}" fill="#83cce9" stroke="#4aa9d2" stroke-width="0.5"/>` : ''
  }).join('')}${(showRoads ? input.roads.features : []).map((feature) => {
    const d = pathFor(feature, bounds)
    const color = input.kind === 'site-overview' || input.kind === 'roads' ? '#ed6846' : '#fff'
    return d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${input.kind === 'site-overview' || input.kind === 'roads' ? '2.1' : '2.3'}"/>` : ''
  }).join('')}</g>`)

  if (input.kind === 'waterways') legend.push({ color: '#4aa9d2', label: '하천·수계' })
  if (input.kind === 'roads') legend.push({ color: '#ed6846', label: '사이트 보유 주요 도로' })

  if (input.kind === 'site-overview') {
    const parks = officialParks.filter((item) =>
      regions.some((feature) => insideFeature([item.longitude, item.latitude], feature)))
    layers.push(`<g clip-path="url(#selected-regions-clip)">${parks.map((item) => {
      const [cx, cy] = project(bounds, [item.longitude, item.latitude])
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.5" fill="#13894a"/>`
    }).join('')}</g>`)
    legend.push({ color: '#83cce9', label: '하천' }, { color: '#ed6846', label: '주요 도로' }, { color: '#13894a', label: '공원 위치' })
  } else if (['elementary-locations', 'elementary-access', 'park-locations', 'park-access', 'admin-locations', 'admin-access'].includes(input.kind)) {
    const elementary = input.kind.startsWith('elementary-')
    const park = input.kind.startsWith('park-')
    const access = input.kind.endsWith('-access')
    const points = (park ? officialParks : input.facilities.filter((item) =>
      item.category === (elementary ? 'SCHOOL' : 'ADMIN_CENTER') &&
      (!elementary || /초등학교/.test(item.name)))).filter((item) =>
      Number.isFinite(item.longitude) && Number.isFinite(item.latitude) &&
      regions.some((feature) => park && access && 'parkType' in item
        ? withinRadiusOfFeature([item.longitude, item.latitude], feature,
          parkRadius(item.parkType, item.areaM2, input.radiusMeters))
        : insideFeature([item.longitude, item.latitude], feature)))
    const seen = new Set<string>()
    const unique = points.filter((item) => {
      const key = park && 'parkType' in item
        ? `${item.name.replace(/\s/g, '')}:${item.parkType}:${item.longitude}:${item.latitude}:${item.areaM2}`
        : !elementary && !park
        ? item.name.replace(/\s/g, '')
        : `${item.name.replace(/\s/g, '')}:${item.longitude.toFixed(3)}:${item.latitude.toFixed(3)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const color = elementary ? '#bc5b93' : park ? '#168448' : '#2475c9'
    const averageLat = (bounds.minY + bounds.maxY) / 2
    const scale = Math.min(MAP.width / (bounds.maxX - bounds.minX), MAP.height / (bounds.maxY - bounds.minY))
    layers.push(`<g clip-path="url(#selected-regions-clip)">${unique.map((item) => {
      const [cx, cy] = project(bounds, [item.longitude, item.latitude])
      const parkType = park && 'parkType' in item ? item.parkType : ''
      const markerColor = park ? PARK_COLORS[parkType] ?? color : color
      const areaM2 = park && 'areaM2' in item ? item.areaM2 : 0
      const radius = elementary ? 750 : park ? parkRadius(parkType, areaM2, input.radiusMeters) : 1000
      const rx = radius / (111320 * Math.cos(averageLat * Math.PI / 180)) * scale
      const ry = radius / 111320 * scale
      const inner = access && !park
        ? `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(rx * (elementary ? 500 / 750 : 0.5)).toFixed(1)}" ry="${(ry * (elementary ? 500 / 750 : 0.5)).toFixed(1)}" fill="${color}" fill-opacity="0.36"/>`
        : ''
      const outer = access ? `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${markerColor}" fill-opacity="0.29" stroke="${markerColor}" stroke-opacity="0.22"/>` : ''
      const marker = !park || regions.some((feature) => insideFeature([item.longitude, item.latitude], feature))
        ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.4" fill="${markerColor}"/>` : ''
      return `${outer}${inner}${marker}`
    }).join('')}</g>`)
    if (park) {
      for (const [parkType, typeColor] of Object.entries(PARK_COLORS)) {
        const count = unique.filter((item) => 'parkType' in item && item.parkType === parkType).length
        if (count) legend.push({ color: typeColor, label: `${parkType}${access ? ' 영향권' : ''} ${count}개` })
      }
    } else legend.push({ color, label: `${elementary ? '초등학교' : '행정복지센터'} ${unique.length}개 지점` })
    if (access) legend.push({ color: '#d3d3d3', label: elementary ? '영향권 반경 500m·750m' : park
      ? `유형별 직선거리 반경 250·500·1000m (기타 ${input.radiusMeters}m)` : '영향권 반경 500m·1000m' })
  }

  layers.push(...boundaryPaths.map((d) => `<path d="${d}" fill="none" stroke="#66685e" stroke-width="1.5"/>`))
  regions.forEach((feature) => {
    const name = adminName(feature)
    const box = boundsOf([feature])
    const [x, y] = project(bounds, [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2])
    layers.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="15" font-weight="700" fill="#313b34" paint-order="stroke" stroke="#fff" stroke-width="3">${name}</text>`)
    if (input.kind === 'population-choropleth') {
      const value = populationByCode.get(String(feature.properties.adm_cd2 ?? ''))
      if (value !== undefined) layers.push(`<text x="${x.toFixed(1)}" y="${(y + 23).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="700" fill="#313b34" paint-order="stroke" stroke="#fff" stroke-width="3">${value.toLocaleString('ko-KR')}명</text>`)
    }
  })
  const source = input.kind === 'site-overview' ? '사이트 법정동·개발구역·하천·도로 · 공공데이터포털 도시공원정보(2026-05-04)' :
    input.kind === 'population-choropleth' ? `사이트 인구 DB · ${input.population?.statsYm.slice(0, 4)}년 ${Number(input.population?.statsYm.slice(4))}월` :
    input.kind.startsWith('park-') ? '공공데이터포털 도시공원정보(2026-05-04) · 공원구분·면적·좌표' :
    input.kind === 'waterways' ? '사이트 하천 GeoJSON' :
    input.kind === 'roads' ? '사이트 주요 도로 GeoJSON' :
    input.kind === 'administrative' ? '사이트 행정동·법정동 경계 GeoJSON' :
    input.kind.endsWith('-access') ? '사이트 시설 DB · 직선거리 반경' : '사이트 시설 DB · 행정동 경계'
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>
<defs>${clip}</defs><g font-family="Malgun Gothic, sans-serif">${layers.join('')}</g>
<text x="40" y="791" font-family="Malgun Gothic, sans-serif" font-size="13" fill="#6b7280">자료: ${escapeXml(source)}</text>
</svg>`, legend }
}

export function buildReportFigureSvg(input: ReportFigureInput): string {
  return buildReportFigure(input).svg
}
