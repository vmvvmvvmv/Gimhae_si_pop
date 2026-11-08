let naverScriptPromise: Promise<void> | null = null
let naverGeocoderScriptPromise: Promise<void> | null = null

export function loadNaverMaps(clientId: string): Promise<void> {
  const loadGeocoder = (): Promise<void> => {
    if (window.naver?.maps?.Service) return Promise.resolve()
    if (naverGeocoderScriptPromise) return naverGeocoderScriptPromise

    naverGeocoderScriptPromise = new Promise((resolve, reject) => {
      const addonScript = document.createElement('script')
      addonScript.src = 'https://oapi.map.naver.com/openapi/v3/maps-geocoder.js'
      addonScript.async = true
      addonScript.onload = () => resolve()
      addonScript.onerror = () => reject(new Error('주소 검색 기능을 불러오지 못했습니다.'))
      document.head.appendChild(addonScript)
    })
    return naverGeocoderScriptPromise
  }

  if (window.naver?.maps) {
    return loadGeocoder()
  }

  if (naverScriptPromise) {
    return naverScriptPromise
  }

  naverScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')

    script.src =
      `https://oapi.map.naver.com/openapi/v3/maps.js` +
      `?ncpKeyId=${encodeURIComponent(clientId)}`

    script.async = true
    script.onload = () => void loadGeocoder().then(resolve, reject)
    script.onerror = () => {
      reject(new Error('네이버 지도 API를 불러오지 못했습니다.'))
    }

    document.head.appendChild(script)
  })

  return naverScriptPromise
}
