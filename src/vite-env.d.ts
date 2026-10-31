declare global {
  interface NaverFeature {
    getProperty(name: string): unknown
  }

  interface NaverDataPointerEvent {
    feature: NaverFeature
    coord: unknown
  }

  interface NaverMapData {
    addGeoJson(data: unknown): NaverFeature[]
    removeFeature(feature: NaverFeature): string | number
    setStyle(
      style: (feature: NaverFeature) => Record<string, unknown>,
    ): void
    addListener(
      eventName: string,
      handler: (event: NaverDataPointerEvent) => void,
    ): void
    overrideStyle(
      feature: NaverFeature,
      style: Record<string, unknown>,
    ): void
    revertStyle(feature?: NaverFeature): void
  }

  interface NaverMapInstance {
    data: NaverMapData
    getProjection(): {
      fromCoordToOffset(coordinate: unknown): { x: number; y: number }
    }
    morph(
      coordinate: unknown,
      zoom?: number,
      transitionOptions?: Record<string, unknown>,
    ): void
    destroy?(): void
  }

  interface NaverMarker {
    setMap(map: NaverMapInstance | null): void
  }

  interface NaverTrafficLayer {
    setMap(map: NaverMapInstance | null): void
  }

  interface NaverInfoWindow {
    setContent(content: string): void
    open(map: NaverMapInstance, coord: unknown): void
    close(): void
  }

  interface NaverPanorama {
    getLocation(): {
      coord: {
        lat(): number
        lng(): number
      }
    } | null
    setPov(pov: Record<string, number>): void
    setVisible(visible: boolean): void
  }

  interface NaverGeocodeResponse {
    v2: {
      addresses: Array<{
        roadAddress?: string
        jibunAddress?: string
        x: string
        y: string
      }>
    }
  }

  interface NaverMapService {
    Status: {
      OK: string
    }
    geocode(
      options: { query: string },
      callback: (status: string, response?: NaverGeocodeResponse) => void,
    ): void
  }

  interface NaverMapsNamespace {
    Map: new (
      element: HTMLElement,
      options: Record<string, unknown>,
    ) => NaverMapInstance
    LatLng: new (latitude: number, longitude: number) => unknown
    Point: new (x: number, y: number) => unknown
    InfoWindow: new (
      options: Record<string, unknown>,
    ) => NaverInfoWindow
    Marker: new (
      options: Record<string, unknown>,
    ) => NaverMarker
    TrafficLayer: new (
      options?: Record<string, unknown>,
    ) => NaverTrafficLayer
    Panorama?: new (
      element: HTMLElement,
      options: Record<string, unknown>,
    ) => NaverPanorama
    Service?: NaverMapService
    Event: {
      addListener(
        target: unknown,
        eventName: string,
        handler: (...args: unknown[]) => void,
      ): unknown
      clearInstanceListeners(target: unknown): void
    }
    MapTypeId: {
      NORMAL: string
    }
    MapTypeControlStyle: {
      BUTTON: unknown
    }
    ZoomControlStyle: {
      SMALL: unknown
    }
    Position: {
      TOP_RIGHT: unknown
      RIGHT_CENTER: unknown
    }
  }

  interface NaverNamespace {
    maps?: NaverMapsNamespace
  }

  interface Window {
    naver?: NaverNamespace
  }
}

export {}
