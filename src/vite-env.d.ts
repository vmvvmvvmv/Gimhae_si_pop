declare global {
  interface NaverFeature {
    getProperty(name: string): unknown
  }

  interface NaverDataPointerEvent {
    feature: NaverFeature
    coord: unknown
  }

  interface NaverMapData {
    addGeoJson(data: unknown): void
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
    revertStyle(): void
  }

  interface NaverMapInstance {
    data: NaverMapData
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
    Event: {
      addListener(
        target: unknown,
        eventName: string,
        handler: () => void,
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
