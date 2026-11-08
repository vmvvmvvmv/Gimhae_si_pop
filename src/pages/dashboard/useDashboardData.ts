import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { availabilityQueryOptions } from '../../features/auth/useSession'
import {
  getRegionCode,
  getRegionName,
  loadBoundary,
  loadDevelopmentAreas,
  loadMajorRoads,
  loadWaterways,
  type BoundaryType,
  type GeoJsonCollection,
  type GeoJsonFeature,
} from '../../features/boundaries/boundaryLoader'
import { countFacilitiesByCategory, featuresIntersect } from '../../features/boundaries/spatialAnalysis'
import { fetchDevelopmentNotices } from '../../features/development/developmentApi'
import {
  getDevelopmentAreaMetadata,
  getDevelopmentFeatureArea,
  resolveSelectedDevelopmentAreas,
} from '../../features/development/developmentMatching'
import {
  FACILITY_OPTIONS,
  fetchFacilities,
  type FacilityCategory,
  type FacilityItem,
} from '../../features/facilities/facilityApi'
import {
  selectComparisonBaseMonth,
  selectPopulationMonth,
} from '../../features/population/availabilitySelection'
import {
  fetchPopulation,
  fetchPopulationComparison,
  fetchPopulationTrend,
  fetchSimilarDensity,
  type PopulationLevel,
} from '../../features/population/populationApi'
import { recordPerformanceMilestone } from '../../lib/performanceMetrics'

export interface SelectedRegion {
  name: string
  code: string
  type: BoundaryType
}

// 대시보드가 서버와 파일에서 읽는 자료를 영역별 훅으로 모았습니다. 화면 상태와 클릭 처리는 DashboardPage에 있습니다.

export function usePopulationPeriod(boundaryType: BoundaryType) {
  const [selectedStatsYm, setSelectedStatsYm] = useState<string | null>(null)
  const [comparisonBaseYm, setComparisonBaseYm] = useState('')

  const populationLevel: PopulationLevel =
    boundaryType === 'administrative' ? 'admin' : 'legal'

  // 1) DB에 저장된 월 목록 → 2) 사용할 월 선택 → 3) 해당 월 인구 조회 순서입니다.
  // useQuery의 queryKey가 달라지면 새 자료를 요청하고, 같은 키는 캐시를 재사용합니다.
  const availabilityQuery = useQuery(availabilityQueryOptions)

  const availabilityItems = useMemo(() => {
    return availabilityQuery.data?.items.filter(
      (item) => item.level === populationLevel,
    ) ?? []
  }, [availabilityQuery.data, populationLevel])

  const availableMonths = useMemo(
    () => availabilityItems.map((item) => item.statsYm),
    [availabilityItems],
  )

  const availableYears = useMemo(() => {
    return Array.from(
      new Set(availableMonths.map((statsYm) => Number(statsYm.slice(0, 4)))),
    ).sort((left, right) => right - left)
  }, [availableMonths])

  const effectiveStatsYm = useMemo(() => {
    // 목록을 받기 전에는 202512를 임시로 쓰지만, 실제 요청은 아래
    // populationQuery의 enabled 조건 때문에 저장된 월을 확인한 뒤 시작합니다.
    return selectPopulationMonth(
      availabilityItems,
      populationLevel,
      selectedStatsYm,
    ) || '202512'
  }, [availabilityItems, populationLevel, selectedStatsYm])

  const effectiveYear = Number(effectiveStatsYm.slice(0, 4))
  const effectiveMonth = Number(effectiveStatsYm.slice(4))
  const selectedMonthAvailability = availabilityItems.find(
    (item) => item.statsYm === effectiveStatsYm,
  )

  const effectiveComparisonBaseYm = useMemo(() => {
    return selectComparisonBaseMonth(
      availabilityItems,
      populationLevel,
      effectiveStatsYm,
      comparisonBaseYm,
    )
  }, [
    availabilityItems,
    comparisonBaseYm,
    effectiveStatsYm,
    populationLevel,
  ])
  const comparisonBaseAvailability = availabilityItems.find(
    (item) => item.statsYm === effectiveComparisonBaseYm,
  )

  const availableMonthsInYear = useMemo(() => {
    return availableMonths
      .filter((statsYm) => Number(statsYm.slice(0, 4)) === effectiveYear)
      .map((statsYm) => Number(statsYm.slice(4)))
  }, [availableMonths, effectiveYear])


  const populationQuery = useQuery({
    // 행정동/법정동 또는 월이 바뀌면 queryKey가 달라져 해당 자료를 다시 읽습니다.
    queryKey: ['population', populationLevel, effectiveYear, effectiveMonth],
    queryFn: () =>
      fetchPopulation(populationLevel, effectiveYear, effectiveMonth),
    enabled: availableMonths.length > 0,
  })

  useEffect(() => {
    if (availabilityQuery.data) {
      recordPerformanceMilestone('조회 기간 준비')
    }
  }, [availabilityQuery.data])

  useEffect(() => {
    if (populationQuery.data) {
      recordPerformanceMilestone('첫 인구 데이터 준비')
    }
  }, [populationQuery.data])

  const populationMaximum = useMemo(
    () => Math.max(
      0,
      ...(populationQuery.data?.items.map((item) => item.population) ?? []),
    ),
    [populationQuery.data],
  )

  return {
    populationLevel,
    availabilityQuery,
    availabilityItems,
    availableMonths,
    availableYears,
    effectiveStatsYm,
    effectiveYear,
    effectiveMonth,
    selectedMonthAvailability,
    effectiveComparisonBaseYm,
    comparisonBaseAvailability,
    availableMonthsInYear,
    populationQuery,
    populationMaximum,
    setSelectedStatsYm,
    setComparisonBaseYm,
  }
}

export function useFacilityData(visibleFacilityCategories: FacilityCategory[]) {
  const facilitiesQuery = useQuery({
    queryKey: ['facilities', 'all'],
    queryFn: () => fetchFacilities(
      FACILITY_OPTIONS.map((option) => option.category),
    ),
    staleTime: 60 * 60 * 1000,
  })

  const visibleFacilityItems = useMemo(() => {
    const visible = new Set(visibleFacilityCategories)
    return facilitiesQuery.data?.items.filter(
      (item) => visible.has(item.category),
    ) ?? []
  }, [facilitiesQuery.data, visibleFacilityCategories])

  const facilityCountByCategory = useMemo(() => {
    const counts = new Map<FacilityCategory, number>()
    for (const item of facilitiesQuery.data?.items ?? []) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    }
    return counts
  }, [facilitiesQuery.data])

  return {
    facilitiesQuery,
    visibleFacilityItems,
    facilityCountByCategory,
  }
}

export function useMapOverlayData() {
  const majorRoadsQuery = useQuery({
    queryKey: ['major-roads'],
    queryFn: loadMajorRoads,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const waterwaysQuery = useQuery({
    queryKey: ['waterways'],
    queryFn: loadWaterways,
    staleTime: Number.POSITIVE_INFINITY,
  })

  return {
    majorRoadsQuery,
    waterwaysQuery,
  }
}

interface RegionDetailOptions {
  selectedRegion: SelectedRegion | null
  boundaryType: BoundaryType
  populationLevel: PopulationLevel
  effectiveYear: number
  effectiveMonth: number
  effectiveStatsYm: string
  effectiveComparisonBaseYm: string
  availableMonths: string[]
  isLocked: boolean
}

export function useRegionDetailQueries({
  selectedRegion,
  boundaryType,
  populationLevel,
  effectiveYear,
  effectiveMonth,
  effectiveStatsYm,
  effectiveComparisonBaseYm,
  availableMonths,
  isLocked,
}: RegionDetailOptions) {
  // 선택 지역이 있어야 의미 있는 상세 조회는 enabled 조건으로 요청을 늦춥니다.
  const similarDensityQuery = useQuery({
    queryKey: [
      'similar-density',
      selectedRegion?.code,
      effectiveYear,
      effectiveMonth,
    ],
    queryFn: () =>
      fetchSimilarDensity(
        selectedRegion?.code ?? '',
        effectiveYear,
        effectiveMonth,
      ),
    enabled: Boolean(
      // 전국 유사 지역 비교는 행정동용 자료입니다. 법정동 선택 때는 요청하지 않습니다.
      !isLocked && selectedRegion && boundaryType === 'administrative' && availableMonths.length,
    ),
  })

  const comparisonQuery = useQuery({
    queryKey: [
      'population-comparison',
      populationLevel,
      selectedRegion?.code,
      effectiveComparisonBaseYm,
      effectiveStatsYm,
    ],
    queryFn: () =>
      fetchPopulationComparison(
        populationLevel,
        selectedRegion?.code ?? '',
        effectiveComparisonBaseYm,
        effectiveStatsYm,
      ),
    enabled: Boolean(
      !isLocked &&
        selectedRegion &&
        effectiveComparisonBaseYm &&
        effectiveComparisonBaseYm !== effectiveStatsYm,
    ),
  })

  const trendQuery = useQuery({
    queryKey: [
      'population-trend',
      populationLevel,
      selectedRegion?.code,
    ],
    queryFn: () =>
      fetchPopulationTrend(
        populationLevel,
        selectedRegion?.code ?? '',
      ),
    enabled: Boolean(!isLocked && selectedRegion),
    staleTime: 5 * 60 * 1000,
  })

  return {
    similarDensityQuery,
    comparisonQuery,
    trendQuery,
  }
}

export function useRegionBoundaries(boundaryType: BoundaryType) {
  const administrativeBoundaryQuery = useQuery({
    queryKey: ['boundary-search', 'administrative'],
    queryFn: () => loadBoundary('administrative'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  const legalBoundaryQuery = useQuery({
    queryKey: ['boundary-search', 'legal'],
    queryFn: () => loadBoundary('legal'),
    staleTime: Number.POSITIVE_INFINITY,
  })

  const administrativeExportRegions = useMemo(() => {
    const regions = new Map<string, string>()
    administrativeBoundaryQuery.data?.features.forEach((feature) => {
      const code = getRegionCode(feature.properties, 'administrative')
      if (code) regions.set(code, getRegionName(feature.properties, 'administrative'))
    })
    return Array.from(regions, ([code, name]) => ({ code, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
  }, [administrativeBoundaryQuery.data])

  const exportRegionOptions = useMemo(() => {
    if (boundaryType === 'administrative') return administrativeExportRegions
    const features = legalBoundaryQuery.data?.features
    const regions = new Map<string, string>()
    features?.forEach((feature) => {
      const code = getRegionCode(feature.properties, boundaryType)
      if (code) regions.set(code, getRegionName(feature.properties, boundaryType))
    })
    return Array.from(regions, ([code, name]) => ({ code, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
  }, [administrativeExportRegions, boundaryType, legalBoundaryQuery.data])

  return {
    administrativeBoundaryQuery,
    legalBoundaryQuery,
    administrativeExportRegions,
    exportRegionOptions,
  }
}

interface DevelopmentLayerOptions {
  shouldLoad: boolean
  selectedDevelopmentAreaIds: string[]
  developmentYearFilter: string
  hideEndedDevelopmentAreas: boolean
}

export function useDevelopmentLayers({
  shouldLoad,
  selectedDevelopmentAreaIds,
  developmentYearFilter,
  hideEndedDevelopmentAreas,
}: DevelopmentLayerOptions) {
  const developmentAreasQuery = useQuery({
    // 도형 파일은 검색하거나 개발계획을 볼 때만 읽어 첫 화면의 부담을 줄입니다.
    queryKey: ['development-areas'],
    queryFn: loadDevelopmentAreas,
    enabled: shouldLoad,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const developmentNoticesQuery = useQuery({
    // 도형은 GeoJSON, 고시 목록은 API/DB에서 옵니다. 아래에서 두 자료를 연결합니다.
    queryKey: ['development-notices'],
    queryFn: fetchDevelopmentNotices,
    enabled: shouldLoad,
    staleTime: 5 * 60 * 1000,
  })

  const selectedDevelopmentAreas = useMemo(
    () => resolveSelectedDevelopmentAreas(
      selectedDevelopmentAreaIds,
      developmentAreasQuery.data,
      developmentNoticesQuery.data?.items ?? [],
    ),
    [
      selectedDevelopmentAreaIds,
      developmentAreasQuery.data,
      developmentNoticesQuery.data,
    ],
  )

  const developmentAreaMetadata = useMemo(() => {
    const metadata = new Map<
      GeoJsonFeature,
      ReturnType<typeof getDevelopmentAreaMetadata>
    >()
    const notices = developmentNoticesQuery.data?.items ?? []
    for (const feature of developmentAreasQuery.data?.features ?? []) {
      metadata.set(feature, getDevelopmentAreaMetadata(feature, notices))
    }
    return metadata
  }, [developmentAreasQuery.data, developmentNoticesQuery.data])

  const developmentYearOptions = useMemo(
    () =>
      Array.from(
        new Set(
          Array.from(developmentAreaMetadata.values())
            .map((metadata) => metadata.noticeYear)
            .filter((noticeYear): noticeYear is number => noticeYear !== null),
        ),
      ).sort((left, right) => right - left),
    [developmentAreaMetadata],
  )

  const filteredDevelopmentAreas = useMemo(() => {
    // 연도·종료 상태를 먼저 거른 뒤 지도에 넘겨야 화면과 클릭 대상이 일치합니다.
    const collection = developmentAreasQuery.data
    if (!collection) return undefined

    const features = collection.features
      .filter((feature) => {
        const metadata = developmentAreaMetadata.get(feature)
        const matchesYear =
          developmentYearFilter === 'all' ||
          (developmentYearFilter === 'unknown'
            ? metadata?.noticeYear === null
            : metadata?.noticeYear === Number(developmentYearFilter))
        const matchesStatus =
          !hideEndedDevelopmentAreas || !metadata?.isEnded
        return matchesYear && matchesStatus
      })
      // NAVER Data 레이어는 나중에 추가된 도형이 위에서 클릭됩니다.
      // 큰 구역부터 넣어 작은 구역을 마지막에 그립니다.
      .sort(
        (left, right) =>
          getDevelopmentFeatureArea(right) -
          getDevelopmentFeatureArea(left),
      )

    return { ...collection, features }
  }, [
    developmentAreaMetadata,
    developmentAreasQuery.data,
    developmentYearFilter,
    hideEndedDevelopmentAreas,
  ])

  const visibleDevelopmentAreaIds = useMemo(
    () => new Set(
      filteredDevelopmentAreas?.features.map((feature) =>
        String(feature.properties.areaSourceId ?? ''),
      ) ?? [],
    ),
    [filteredDevelopmentAreas],
  )

  return {
    developmentAreasQuery,
    developmentNoticesQuery,
    selectedDevelopmentAreas,
    developmentYearOptions,
    visibleDevelopmentAreaIds,
  }
}

interface SelectedRegionSpatialOptions {
  selectedRegion: SelectedRegion | null
  boundaryType: BoundaryType
  administrativeBoundaries: GeoJsonCollection | undefined
  legalBoundaries: GeoJsonCollection | undefined
  facilities: FacilityItem[] | undefined
  waterways: GeoJsonCollection | undefined
}

export function useSelectedRegionSpatial({
  selectedRegion,
  boundaryType,
  administrativeBoundaries,
  legalBoundaries,
  facilities,
  waterways,
}: SelectedRegionSpatialOptions) {
  const selectedBoundaryFeature = useMemo(() => {
    const boundaryData = boundaryType === 'administrative'
      ? administrativeBoundaries
      : legalBoundaries
    if (!selectedRegion || !boundaryData) return undefined
    return boundaryData.features.find(
      (feature) =>
        getRegionCode(feature.properties, boundaryType) ===
        selectedRegion.code,
    )
  }, [
    administrativeBoundaries,
    boundaryType,
    legalBoundaries,
    selectedRegion,
  ])

  const deferredSelectedBoundaryFeature = useDeferredValue(
    selectedBoundaryFeature,
  )
  const spatialAnalysisPending =
    selectedBoundaryFeature !== deferredSelectedBoundaryFeature

  const selectedFacilityCounts = useMemo(
    () =>
      countFacilitiesByCategory(
        facilities ?? [],
        deferredSelectedBoundaryFeature,
      ),
    [deferredSelectedBoundaryFeature, facilities],
  )

  const selectedWaterwayCount = useMemo(() => {
    if (!deferredSelectedBoundaryFeature || !waterways) return null
    return waterways.features.filter((feature) =>
      featuresIntersect(deferredSelectedBoundaryFeature, feature),
    ).length
  }, [deferredSelectedBoundaryFeature, waterways])

  const selectedLivingFacilityCount =
    (selectedFacilityCounts.get('HOSPITAL') ?? 0) +
    (selectedFacilityCounts.get('SCHOOL') ?? 0) +
    (selectedFacilityCounts.get('UNIVERSITY') ?? 0) +
    (selectedFacilityCounts.get('MARKET') ?? 0) +
    (selectedFacilityCounts.get('PARK') ?? 0)

  return {
    spatialAnalysisPending,
    selectedFacilityCounts,
    selectedWaterwayCount,
    selectedLivingFacilityCount,
  }
}
