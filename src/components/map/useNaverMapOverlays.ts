import { useEffect, type RefObject } from 'react'
import type { FacilityCategory, FacilityItem } from '../../features/facilities/facilityApi'
import { renderFacilityInfo } from './naverMapContent'
import type { AddressSearchRequest, AddressSearchResult } from './NaverMap'

const FACILITY_MARKER_META: Record<
  FacilityCategory,
  { label: string; className: string }
> = {
  ADMIN_CENTER: {
    label: '행정복지센터',
    className: 'admin-center',
  },
  HOSPITAL: { label: '주요 의료', className: 'hospital' },
  SCHOOL: { label: '학교', className: 'school' },
  UNIVERSITY: { label: '대학교', className: 'university' },
  TRANSIT: { label: '교통거점', className: 'transit' },
  BRIDGE: { label: '교량', className: 'bridge' },
  PARK: { label: '공원', className: 'park' },
  MARKET: { label: '시장·마트', className: 'market' },
}

interface FacilityMarkerOptions {
  mapRef: RefObject<NaverMapInstance | null>
  facilityMarkersRef: RefObject<Map<number, NaverMarker>>
  facilityInfoWindowRef: RefObject<NaverInfoWindow | null>
  developmentInfoWindowRef: RefObject<NaverInfoWindow | null>
  developmentInfoPinnedRef: RefObject<boolean>
  onSelectFacilityRef: RefObject<((facility: FacilityItem) => void) | undefined>
  facilityItems: FacilityItem[]
  status: string
}

// 켜진 시설만 마커로 유지합니다. 전체를 다시 그리지 않고 바뀐 시설만 더하고 뺍니다.
export function useFacilityMarkers({
  mapRef,
  facilityMarkersRef,
  facilityInfoWindowRef,
  developmentInfoWindowRef,
  developmentInfoPinnedRef,
  onSelectFacilityRef,
  facilityItems,
  status,
}: FacilityMarkerOptions) {
  useEffect(() => {
    const maps = window.naver?.maps
    const map = mapRef.current

    if (!maps || !map || status !== 'ready') {
      return
    }

    const visibleIds = new Set(facilityItems.map((facility) => facility.id))
    for (const [id, marker] of facilityMarkersRef.current) {
      if (visibleIds.has(id)) continue
      maps.Event.clearInstanceListeners(marker)
      marker.setMap(null)
      facilityMarkersRef.current.delete(id)
    }

    if (!facilityItems.length) {
      facilityInfoWindowRef.current?.close()
      return
    }

    const infoWindow = facilityInfoWindowRef.current ?? new maps.InfoWindow({
        content: '<div class="facility-info"></div>',
        borderWidth: 0,
        backgroundColor: 'transparent',
        pixelOffset: new maps.Point(0, -14),
      })
    facilityInfoWindowRef.current = infoWindow

    for (const facility of facilityItems) {
      if (facilityMarkersRef.current.has(facility.id)) continue
      const markerMeta = FACILITY_MARKER_META[facility.category]
      const marker = new maps.Marker({
        position: new maps.LatLng(facility.latitude, facility.longitude),
        map,
        title: facility.name,
        icon: {
          content:
            '<div class="facility-marker-wrap" aria-hidden="true">' +
            '<div class="facility-marker ' + markerMeta.className + '"></div>' +
            '<small class="facility-marker-label">' + markerMeta.label + '</small>' +
            '</div>',
          anchor: new maps.Point(20, 9),
        },
      })

      maps.Event.addListener(marker, 'click', () => {
        if (onSelectFacilityRef.current) {
          infoWindow.close()
          developmentInfoWindowRef.current?.close()
          developmentInfoPinnedRef.current = false
          onSelectFacilityRef.current(facility)
          return
        }
        const address = facility.roadAddress || facility.parcelAddress || ''
        const collectedDate = facility.fetchedAt?.slice(0, 10)
        const provenance = facility.source === 'VWORLD'
          ? `VWorld 장소 검색${collectedDate ? ` · 수집 ${collectedDate}` : ''}`
          : `${facility.source}${collectedDate ? ` · 수집 ${collectedDate}` : ''}`
        infoWindow.setContent(renderFacilityInfo(markerMeta.label, facility.name, address, provenance))
        infoWindow.open(map, marker)
      })

      facilityMarkersRef.current.set(facility.id, marker)
    }
  }, [
    developmentInfoPinnedRef,
    developmentInfoWindowRef,
    facilityInfoWindowRef,
    facilityItems,
    facilityMarkersRef,
    mapRef,
    onSelectFacilityRef,
    status,
  ])
}

interface AddressSearchOptions {
  mapRef: RefObject<NaverMapInstance | null>
  addressSearchMarkerRef: RefObject<NaverMarker | null>
  onAddressSearchResultRef: RefObject<((result: AddressSearchResult) => void) | undefined>
  addressSearchRequest: AddressSearchRequest | null | undefined
  status: string
}

// 검색 요청을 받아 좌표로 이동하거나, 주소이면 네이버 지오코더로 위치를 찾습니다.
export function useAddressSearch({
  mapRef,
  addressSearchMarkerRef,
  onAddressSearchResultRef,
  addressSearchRequest,
  status,
}: AddressSearchOptions) {
  useEffect(() => {
    const maps = window.naver?.maps
    const map = mapRef.current
    if (!maps || !map || status !== 'ready') return

    if (!addressSearchRequest) {
      addressSearchMarkerRef.current?.setMap(null)
      addressSearchMarkerRef.current = null
      return
    }

    if (addressSearchRequest.kind === 'coordinate') {
      addressSearchMarkerRef.current?.setMap(null)
      addressSearchMarkerRef.current = null
      map.morph(
        new maps.LatLng(
          addressSearchRequest.latitude,
          addressSearchRequest.longitude,
        ),
        addressSearchRequest.zoom ?? 17,
        { duration: 500 },
      )
      return
    }

    const service = maps.Service
    if (!service) {
      onAddressSearchResultRef.current?.({ status: 'error' })
      return
    }

    let active = true
    service.geocode(
      { query: addressSearchRequest.query },
      (searchStatus, response) => {
        if (!active) return
        if (searchStatus !== service.Status.OK) {
          onAddressSearchResultRef.current?.({ status: 'error' })
          return
        }

        const address = response?.v2.addresses[0]
        if (!address) {
          onAddressSearchResultRef.current?.({ status: 'empty' })
          return
        }

        const roadAddress = address.roadAddress?.trim() ?? ''
        const jibunAddress = address.jibunAddress?.trim() ?? ''
        if (![roadAddress, jibunAddress].some((value) => value.includes('김해시'))) {
          onAddressSearchResultRef.current?.({ status: 'outside' })
          return
        }

        const latitude = Number(address.y)
        const longitude = Number(address.x)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          onAddressSearchResultRef.current?.({ status: 'error' })
          return
        }

        const coordinate = new maps.LatLng(latitude, longitude)
        addressSearchMarkerRef.current?.setMap(null)
        addressSearchMarkerRef.current = new maps.Marker({
          map,
          position: coordinate,
          title: roadAddress || jibunAddress || addressSearchRequest.query,
          icon: {
            content: '<div class="address-search-marker" aria-hidden="true"><i></i></div>',
            anchor: new maps.Point(18, 40),
          },
        })
        map.morph(coordinate, 17, { duration: 500 })
        onAddressSearchResultRef.current?.({
          status: 'success',
          title: roadAddress || jibunAddress || addressSearchRequest.query,
          subtitle: roadAddress && jibunAddress ? jibunAddress : undefined,
          roadAddress: roadAddress || undefined,
          jibunAddress: jibunAddress || undefined,
        })
      },
    )

    return () => {
      active = false
    }
  }, [addressSearchMarkerRef, addressSearchRequest, mapRef, onAddressSearchResultRef, status])
}
