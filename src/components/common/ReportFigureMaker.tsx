import { useEffect, useMemo, useState } from 'react'
import { fetchFacilities, type FacilityCategory, type FacilityItem } from '../../features/facilities/facilityApi'
import {
  loadBoundary, loadDevelopmentAreas, loadMajorRoads, loadOfficialParks, loadWaterways,
  type GeoJsonCollection,
} from '../../features/boundaries/boundaryLoader'
import {
  fetchPopulation, fetchPopulationAvailability,
  type AdminPopulationResponse,
} from '../../features/population/populationApi'
import { REPORT_FIGURES } from '../../features/reportFigures/reportFigureCatalog'
import { buildReportFigure, type ReportFigureKind, type ReportFigureLegendItem } from '../../features/reportFigures/reportFigureSvg'
import './ReportFigureMaker.css'

type BaseLayers = {
  boundaries: GeoJsonCollection
  legalBoundaries: GeoJsonCollection
  developmentAreas: GeoJsonCollection
  waterways: GeoJsonCollection
  roads: GeoJsonCollection
}

function facilityCategory(kind: ReportFigureKind): FacilityCategory | null {
  if (kind.startsWith('elementary-')) return 'SCHOOL'
  if (kind.startsWith('admin-')) return 'ADMIN_CENTER'
  return null
}

export default function ReportFigureMaker() {
  const [figureId, setFigureId] = useState('1-12')
  const figure = REPORT_FIGURES.find((item) => item.id === figureId) ?? REPORT_FIGURES[0]
  const kind = figure.kind
  const [base, setBase] = useState<BaseLayers | null>(null)
  const [parks, setParks] = useState<GeoJsonCollection | null>(null)
  const [parksError, setParksError] = useState('')
  const [selectedRegionCodes, setSelectedRegionCodes] = useState<string[] | null>(null)
  const regionOptions = useMemo(() => base ? base.boundaries.features.map((feature) => ({
    code: String(feature.properties.adm_cd2 ?? ''),
    name: String(feature.properties.adm_nm ?? '').split(/\s+/).at(-1) ?? '',
  })).filter((region) => region.code && region.name) : [], [base])
  const selectedCodes = useMemo(() => selectedRegionCodes ?? regionOptions
    .filter((region) => /^장유[123]동$/.test(region.name)).map((region) => region.code), [regionOptions, selectedRegionCodes])
  const selectedCodeSet = useMemo(() => new Set(selectedCodes), [selectedCodes])
  const [facilities, setFacilities] = useState<FacilityItem[]>([])
  const [facilitiesReadyFor, setFacilitiesReadyFor] = useState<ReportFigureKind | null>(null)
  const [radiusMeters, setRadiusMeters] = useState(500)
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [availabilityReady, setAvailabilityReady] = useState(false)
  const [selectedYm, setSelectedYm] = useState('')
  const [population, setPopulation] = useState<AdminPopulationResponse | null>(null)
  const [populationReadyYm, setPopulationReadyYm] = useState('')
  const [baseError, setBaseError] = useState('')
  const [dataError, setDataError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggleRegion = (code: string) => {
    setSelectedRegionCodes(selectedCodeSet.has(code)
      ? selectedCodes.filter((item) => item !== code)
      : [...selectedCodes, code])
  }

  useEffect(() => {
    let active = true
    Promise.all([
      loadBoundary('administrative'), loadBoundary('legal'), loadDevelopmentAreas(),
      loadWaterways(), loadMajorRoads(),
    ]).then(([boundaries, legalBoundaries, developmentAreas, waterways, roads]) => {
      if (active) setBase({ boundaries, legalBoundaries, developmentAreas, waterways, roads })
    }).catch(() => { if (active) setBaseError('사이트의 경계·도로·하천 자료를 불러오지 못했습니다.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    loadOfficialParks().then((result) => { if (active) setParks(result) })
      .catch(() => { if (active) setParksError('공식 도시공원 자료를 불러오지 못했습니다.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    fetchPopulationAvailability().then((response) => {
      if (!active) return
      const months = response.items.filter((item) => item.level === 'admin' && item.complete)
        .map((item) => item.statsYm).sort().reverse()
      setAvailableMonths(months)
      setSelectedYm(months.includes('202512') ? '202512' : months[0] ?? '')
      setAvailabilityReady(true)
    }).catch(() => { if (active) setAvailabilityReady(true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!kind) return
    const category = facilityCategory(kind)
    if (!category) return
    let active = true
    fetchFacilities([category]).then((response) => {
      if (!active) return
      setFacilities(response.items)
      setFacilitiesReadyFor(kind)
    }).catch(() => { if (active) setDataError('사이트 시설 DB를 불러오지 못했습니다.') })
    return () => { active = false }
  }, [kind])

  useEffect(() => {
    if (kind !== 'population-choropleth' || !selectedYm || populationReadyYm === selectedYm) return
    let active = true
    const year = Number(selectedYm.slice(0, 4))
    const month = Number(selectedYm.slice(4))
    fetchPopulation('admin', year, month).then((response) => {
      if (!active) return
      setPopulation(response)
      setPopulationReadyYm(selectedYm)
    }).catch(() => { if (active) setDataError('선택한 기준월의 인구 자료를 불러오지 못했습니다.') })
    return () => { active = false }
  }, [kind, selectedYm, populationReadyYm])

  const render = useMemo<{ svg: string; legend: ReportFigureLegendItem[]; error: string }>(() => {
    const empty = { svg: '', legend: [] }
    if (!kind || !base) return { ...empty, error: '' }
    if (!selectedCodes.length) return { ...empty, error: '행정동을 하나 이상 선택하세요.' }
    if ((kind.startsWith('park-') || kind === 'site-overview') && !parks) return { ...empty, error: parksError }
    if (facilityCategory(kind) && facilitiesReadyFor !== kind) return { ...empty, error: '' }
    if (kind === 'population-choropleth' && availabilityReady && !availableMonths.length) return { ...empty, error: '조회 가능한 행정동 인구 기준월이 없습니다.' }
    if (kind === 'population-choropleth' && (!selectedYm || populationReadyYm !== selectedYm || !population)) return { ...empty, error: '' }
    try {
      return {
        ...buildReportFigure({
          kind, ...base, parks: parks ?? undefined, facilities, radiusMeters, selectedRegionCodes: selectedCodes,
          population: population ? {
            statsYm: selectedYm,
            items: population.items.map((item) => ({
              regionCode: item.regionCode, regionName: item.regionName, population: item.population,
            })),
          } : undefined,
          focusRegion: figure.focusRegion,
        }),
        error: '',
      }
    } catch (error) {
      return { ...empty, error: error instanceof Error ? error.message : '그림을 만들지 못했습니다.' }
    }
  }, [availabilityReady, availableMonths, base, facilities, facilitiesReadyFor, figure, kind, parks, parksError, population, populationReadyYm, radiusMeters, selectedCodes, selectedYm])

  const previewUrl = useMemo(() => render.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(render.svg)}` : '', [render.svg])

  const downloadPng = async () => {
    if (!previewUrl) return
    setBusy(true)
    setDataError('')
    try {
      const picture = new Image()
      picture.src = previewUrl
      await picture.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 820 + (render.legend.length ? Math.ceil(render.legend.length / 2) * 30 + 32 : 0)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('이미지를 만들 수 없습니다.')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(picture, 0, 0)
      context.font = '16px Malgun Gothic, sans-serif'
      render.legend.forEach((item, index) => {
        const x = 40 + (index % 2) * 560
        const y = 844 + Math.floor(index / 2) * 30
        context.fillStyle = item.color
        context.fillRect(x, y, 18, 18)
        context.fillStyle = '#313b34'
        context.fillText(item.label, x + 27, y + 15, 520)
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('PNG 변환에 실패했습니다.')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `김해_GIS_${figure.label.replace(/[\\/:*?"<>|]/g, '')}_${new Date().toISOString().slice(0, 10)}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) {
      setDataError(reason instanceof Error ? reason.message : 'PNG 파일을 만들지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="report-figure-maker" aria-label="GIS 자료">
      <div className="report-figure-controls">
        <label>GIS 자료
          <select value={figureId} onChange={(event) => { setFigureId(event.target.value); setDataError('') }}>
            {REPORT_FIGURES.filter((item) => item.kind && !item.focusRegion).map((item) =>
              <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {kind === 'park-access' && <label>기타 공원 영향권 반경
          <select value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))}>
            <option value={250}>250m</option><option value={500}>500m</option><option value={1000}>1000m</option>
          </select>
        </label>}
        {kind === 'population-choropleth' && <label>인구 기준월
          <select value={selectedYm} onChange={(event) => { setSelectedYm(event.target.value); setDataError('') }}>
            {availableMonths.map((ym) => <option key={ym} value={ym}>{ym.slice(0, 4)}년 {Number(ym.slice(4))}월</option>)}
          </select>
        </label>}
      </div>
      {regionOptions.length > 0 && <fieldset className="report-region-picker">
        <legend>행정동 선택</legend>
        <div className="report-region-picker-list">
          {regionOptions.map((region) => <label key={region.code}>
            <input type="checkbox" checked={selectedCodeSet.has(region.code)} onChange={() => toggleRegion(region.code)} />
            {region.name}
          </label>)}
        </div>
      </fieldset>}
      <p className="report-figure-source">자료: {figure.source}</p>
      {(baseError || dataError || render.error) && <p role="alert">{baseError || dataError || render.error}</p>}
      {!previewUrl && !baseError && !dataError && !render.error && <p role="status">사이트 자료를 불러와 지도를 만드는 중…</p>}
      {previewUrl && <img className="report-figure-preview" src={previewUrl} alt={`사이트 자료로 새로 그린 ${figure.label}`} />}
      {previewUrl && render.legend.length > 0 && <ul className="report-figure-legend" aria-label="범례">
        {render.legend.map((item, index) => <li key={`${item.label}-${index}`}>
          <span className="report-figure-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
          <span>{item.label}</span>
        </li>)}
      </ul>}
      <button type="button" onClick={() => void downloadPng()} disabled={!previewUrl || busy}>
        {busy ? 'PNG 만드는 중…' : 'PNG 내려받기'}
      </button>
    </section>
  )
}
