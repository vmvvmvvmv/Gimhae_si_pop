import {
  getRegionCode,
  getRegionName,
  type GeoJsonFeature,
} from '../../features/boundaries/boundaryLoader'
import {
  createDevelopmentSelection,
  type DevelopmentAreaSelection,
} from '../../features/development/developmentMatching'
import { FACILITY_OPTIONS, type FacilityItem } from '../../features/facilities/facilityApi'
import { getSearchScore, normalizeSearchText } from './dashboardFormat'
import type { SelectedRegion } from './useDashboardData'

export type SiteSearchResult =
  | {
      id: string
      type: 'region'
      title: string
      subtitle: string
      score: number
      region: SelectedRegion
    }
  | {
      id: string
      type: 'development'
      title: string
      subtitle: string
      score: number
      feature: GeoJsonFeature
      selection: DevelopmentAreaSelection
    }
  | {
      id: string
      type: 'facility'
      title: string
      subtitle: string
      score: number
      facility: FacilityItem
    }

interface SiteSearchSources {
  searchTerm: string
  administrativeFeatures: GeoJsonFeature[]
  legalFeatures: GeoJsonFeature[]
  developmentFeatures: GeoJsonFeature[]
  notices: Parameters<typeof createDevelopmentSelection>[1]
  facilities: FacilityItem[]
}

// 검색어로 지역·개발구역·시설을 각각 최대 4개씩 찾아 점수순으로 돌려줍니다.
export function buildSiteSearchResults({
  searchTerm,
  administrativeFeatures,
  legalFeatures,
  developmentFeatures,
  notices,
  facilities,
}: SiteSearchSources): SiteSearchResult[] {
  const query = normalizeSearchText(searchTerm)
  if (!query) return []

  const regionResults: SiteSearchResult[] = [
    ...(administrativeFeatures.map((feature) => ({
      feature,
      boundaryType: 'administrative' as const,
    }))),
    ...(legalFeatures.map((feature) => ({
      feature,
      boundaryType: 'legal' as const,
    }))),
  ]
    .map(({ feature, boundaryType: resultBoundaryType }) => {
      const name = getRegionName(feature.properties, resultBoundaryType)
      const score = getSearchScore(name, query)
      if (!Number.isFinite(score)) return null
      const code = getRegionCode(feature.properties, resultBoundaryType)
      return {
        id: `region-${resultBoundaryType}-${code}`,
        type: 'region' as const,
        title: name.replace(/^경상남도\s+김해시\s*/, ''),
        subtitle: resultBoundaryType === 'administrative' ? '행정동' : '법정동',
        score,
        region: { name, code, type: resultBoundaryType },
      }
    })
    .filter((result): result is Extract<SiteSearchResult, { type: 'region' }> => result !== null)
    .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, 'ko'))
    .slice(0, 4)

  const developmentResults: SiteSearchResult[] = developmentFeatures
    .map((feature) => {
      const selection = createDevelopmentSelection(feature, notices)
      const searchableText = [
        selection.name,
        selection.categoryLabel,
        ...selection.notices.map((notice) => notice.title),
      ].join(' ')
      const score = getSearchScore(searchableText, query)
      if (!Number.isFinite(score)) return null
      return {
        id: `development-${selection.sourceId || selection.name}`,
        type: 'development' as const,
        title: selection.name,
        subtitle: selection.categoryLabel,
        score,
        feature,
        selection,
      }
    })
    .filter((result): result is Extract<SiteSearchResult, { type: 'development' }> => result !== null)
    .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, 'ko'))
    .slice(0, 4)

  const facilityResults: SiteSearchResult[] = facilities
    .map((facility) => {
      const score = getSearchScore(
        `${facility.name} ${facility.roadAddress ?? ''} ${facility.parcelAddress ?? ''}`,
        query,
      )
      if (!Number.isFinite(score)) return null
      return {
        id: `facility-${facility.id}`,
        type: 'facility' as const,
        title: facility.name,
        subtitle:
          FACILITY_OPTIONS.find((option) => option.category === facility.category)?.label ??
          '주요 시설',
        score,
        facility,
      }
    })
    .filter((result): result is Extract<SiteSearchResult, { type: 'facility' }> => result !== null)
    .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, 'ko'))
    .slice(0, 4)

  return [...regionResults, ...developmentResults, ...facilityResults].sort(
    (left, right) => left.score - right.score,
  )
}
