import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface NaverRoadviewProps {
  latitude: number
  longitude: number
  placeName: string
  address?: string | null
}

type RoadviewStatus = 'loading' | 'ready' | 'empty' | 'too-far' | 'error'

const MAX_TRUSTED_PANORAMA_DISTANCE_METERS = 150

function toRadians(value: number): number {
  return value * Math.PI / 180
}

function getDistanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const earthRadius = 6_371_000
  const latitudeDelta = toRadians(toLatitude - fromLatitude)
  const longitudeDelta = toRadians(toLongitude - fromLongitude)
  const fromLatitudeRadians = toRadians(fromLatitude)
  const toLatitudeRadians = toRadians(toLatitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2

  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function getBearingDegrees(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const fromLatitudeRadians = toRadians(fromLatitude)
  const toLatitudeRadians = toRadians(toLatitude)
  const longitudeDelta = toRadians(toLongitude - fromLongitude)
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitudeRadians)
  const x =
    Math.cos(fromLatitudeRadians) * Math.sin(toLatitudeRadians) -
    Math.sin(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.cos(longitudeDelta)

  return Math.atan2(y, x) * 180 / Math.PI
}

let panoramaModulePromise: Promise<void> | null = null
let geocoderModulePromise: Promise<void> | null = null
const geocodeCache = new Map<string, { latitude: number; longitude: number } | null>()

function loadNaverMapAddon(
  addon: 'panorama' | 'geocoder',
  isReady: () => boolean,
): Promise<void> {
  if (isReady()) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://oapi.map.naver.com/openapi/v3/maps-${addon}.js`
    script.async = true
    script.dataset.naverMapAddon = addon
    script.onload = () => {
      if (isReady()) resolve()
      else reject(new Error(`${addon} 모듈을 사용할 수 없습니다.`))
    }
    script.onerror = () => reject(new Error(`${addon} 모듈을 불러오지 못했습니다.`))
    document.head.appendChild(script)
  })
}

function loadPanoramaModule(): Promise<void> {
  if (window.naver?.maps?.Panorama) {
    return Promise.resolve()
  }

  if (panoramaModulePromise) {
    return panoramaModulePromise
  }

  const modulePromise = new Promise<void>((resolve, reject) => {
    if (!window.naver?.maps) {
      reject(new Error('지도 API가 아직 준비되지 않았습니다.'))
      return
    }
    void loadNaverMapAddon(
      'panorama',
      () => Boolean(window.naver?.maps?.Panorama),
    ).then(resolve, reject)
  }).catch((error) => {
    panoramaModulePromise = null
    throw error
  })
  panoramaModulePromise = modulePromise

  return modulePromise
}

function loadGeocoderModule(): Promise<void> {
  if (window.naver?.maps?.Service) return Promise.resolve()
  if (geocoderModulePromise) return geocoderModulePromise

  const modulePromise = loadNaverMapAddon(
    'geocoder',
    () => Boolean(window.naver?.maps?.Service),
  ).catch((error) => {
    geocoderModulePromise = null
    throw error
  })
  geocoderModulePromise = modulePromise
  return modulePromise
}

type RoadviewCoordinate = { latitude: number; longitude: number }

// 새로고침해도 같은 탭에서는 주소 변환 API를 다시 호출하지 않도록 성공한 결과만 보관합니다.
function readStoredCoordinate(address: string): RoadviewCoordinate | null {
  try {
    const stored = sessionStorage.getItem(`roadview-geocode:${address}`)
    return stored ? JSON.parse(stored) as RoadviewCoordinate : null
  } catch {
    return null
  }
}

function storeCoordinate(address: string, coordinate: RoadviewCoordinate): void {
  try {
    sessionStorage.setItem(`roadview-geocode:${address}`, JSON.stringify(coordinate))
  } catch {
    // 저장소를 쓸 수 없으면 메모리 캐시만 사용합니다.
  }
}

async function geocodeAddress(
  address: string,
): Promise<RoadviewCoordinate | null> {
  if (geocodeCache.has(address)) return geocodeCache.get(address) ?? null

  const storedCoordinate = readStoredCoordinate(address)
  if (storedCoordinate) {
    geocodeCache.set(address, storedCoordinate)
    return storedCoordinate
  }

  try {
    await loadGeocoderModule()
  } catch {
    geocodeCache.set(address, null)
    return null
  }

  const service = window.naver?.maps?.Service
  if (!service) return null

  return new Promise((resolve) => {
    service.geocode({ query: address }, (status, response) => {
      // 요청이 실패하면 v2가 없습니다. 여기서 멈추면 로드뷰가 계속 로딩 상태로 남습니다.
      const firstAddress = response?.v2?.addresses[0]
      const latitude = Number(firstAddress?.y)
      const longitude = Number(firstAddress?.x)
      const coordinate =
        status === service.Status.OK &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
          ? { latitude, longitude }
          : null
      geocodeCache.set(address, coordinate)
      if (coordinate) storeCoordinate(address, coordinate)
      resolve(coordinate)
    })
  })
}

export default function NaverRoadview({
  latitude,
  longitude,
  placeName,
  address,
}: NaverRoadviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<RoadviewStatus>('loading')
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
  const [coordinateSource, setCoordinateSource] = useState<'address' | 'poi'>(
    address ? 'address' : 'poi',
  )
  const [expanded, setExpanded] = useState(false)
  const naverMapQuery = [placeName, address].filter(Boolean).join(' ')
  const naverMapUrl = `https://map.naver.com/p/search/${encodeURIComponent(naverMapQuery)}`

  useEffect(() => {
    let active = true
    let panorama: NaverPanorama | null = null
    const container = containerRef.current

    void Promise.all([
      loadPanoramaModule(),
      address ? geocodeAddress(address) : Promise.resolve(null),
    ])
      .then(([, addressCoordinate]) => {
        if (!active || !container || !window.naver?.maps?.Panorama) {
          return
        }

        const maps = window.naver.maps
        const Panorama = maps.Panorama
        if (!Panorama) return
        const roadviewLatitude = addressCoordinate?.latitude ?? latitude
        const roadviewLongitude = addressCoordinate?.longitude ?? longitude
        setCoordinateSource(addressCoordinate ? 'address' : 'poi')

        panorama = new Panorama(container, {
          position: new maps.LatLng(roadviewLatitude, roadviewLongitude),
          pov: { pan: 0, tilt: 0, fov: 95 },
          zoomControl: true,
          aroundControl: true,
          flightSpot: false,
          logoControl: true,
        })

        maps.Event.addListener(panorama, 'pano_status', (result: unknown) => {
          if (!active) return
          if (result !== 'OK') setStatus('empty')
        })
        maps.Event.addListener(panorama, 'pano_changed', () => {
          if (!active || !panorama) return
          const location = panorama.getLocation()
          const panoramaLatitude = location?.coord.lat()
          const panoramaLongitude = location?.coord.lng()
          if (
            typeof panoramaLatitude !== 'number' ||
            typeof panoramaLongitude !== 'number'
          ) {
            setStatus('error')
            return
          }

          const distance = Math.round(getDistanceMeters(
            panoramaLatitude,
            panoramaLongitude,
            roadviewLatitude,
            roadviewLongitude,
          ))
          setDistanceMeters(distance)

          if (distance > MAX_TRUSTED_PANORAMA_DISTANCE_METERS) {
            panorama.setVisible(false)
            setStatus('too-far')
            return
          }

          panorama.setPov({
            pan: getBearingDegrees(
              panoramaLatitude,
              panoramaLongitude,
              roadviewLatitude,
              roadviewLongitude,
            ),
            tilt: 0,
            fov: 80,
          })
          setStatus('ready')
        })
      })
      .catch(() => {
        if (active) setStatus('error')
      })

    return () => {
      active = false
      if (panorama && window.naver?.maps) {
        window.naver.maps.Event.clearInstanceListeners(panorama)
        panorama.setVisible(false)
      }
      if (container) {
        container.replaceChildren()
      }
    }
  }, [address, expanded, latitude, longitude])

  useEffect(() => {
    if (!expanded) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setStatus('loading')
      setExpanded(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [expanded])

  const toggleExpanded = () => {
    setStatus('loading')
    setExpanded((current) => !current)
  }

  const roadview = (
    <section
      className={`facility-roadview ${expanded ? 'expanded' : ''}`}
      aria-label={`${placeName} 로드뷰`}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded ? true : undefined}
    >
      <div className="facility-roadview-heading">
        <div>
          <strong>{placeName} 로드뷰</strong>
        </div>
        <div className="facility-roadview-actions">
          <button
            type="button"
            className="facility-roadview-action"
            aria-label={expanded ? '로드뷰 작게 보기' : '로드뷰 크게 보기'}
            onClick={toggleExpanded}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {expanded ? (
                <>
                  <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                  <path d="m4 9 5-5M20 9l-5-5M4 15l5 5M20 15l-5 5" />
                </>
              ) : (
                <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
              )}
            </svg>
            <span className="sr-only">{expanded ? '작게 보기' : '크게 보기'}</span>
          </button>
          <a
            className="facility-roadview-action"
            href={naverMapUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="네이버 지도에서 보기"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5M19 5l-8 8" />
              <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
            <span className="sr-only">네이버 지도에서 보기</span>
          </a>
        </div>
      </div>
      <div className="facility-roadview-frame">
        <div ref={containerRef} className="facility-roadview-canvas" />
        {status !== 'ready' && (
          <div className={`facility-roadview-state ${status}`} role="status">
            {status === 'loading' ? (
              <>
                <span className="loading-spinner" aria-hidden="true" />
                주변 로드뷰를 찾는 중입니다.
              </>
            ) : status === 'empty' ? (
              '이 시설 주변 300m 안에는 확인 가능한 로드뷰가 없습니다.'
            ) : status === 'too-far' ? (
              `가장 가까운 촬영 지점도 시설에서 약 ${distanceMeters?.toLocaleString()}m 떨어져 있어 로드뷰를 표시하지 않습니다.`
            ) : (
              '로드뷰를 불러오지 못했습니다. 잠시 후 다시 선택해 주세요.'
            )}
          </div>
        )}
      </div>
      {status === 'ready' && (
        <p className="facility-roadview-basis">
          {coordinateSource === 'address' ? '주소' : '시설 좌표'} 기준 · 촬영 지점까지 약{' '}
          {distanceMeters?.toLocaleString()}m
        </p>
      )}
    </section>
  )

  if (!expanded) return roadview

  return createPortal(
    <div
      className="facility-roadview-backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        toggleExpanded()
      }}
    >
      {roadview}
    </div>,
    document.body,
  )
}
