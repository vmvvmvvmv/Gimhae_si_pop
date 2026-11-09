import { describe, expect, it } from 'vitest'
import type { GeoJsonCollection } from '../../features/boundaries/boundaryLoader'
import { createBoundaryOutlines } from './naverMapStyles'

describe('createBoundaryOutlines', () => {
  it('구간마다 SVG가 생기는 선 대신 면 도형 그대로 경계선을 만든다', () => {
    const polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    const multiPolygon = { type: 'MultiPolygon', coordinates: [polygon.coordinates] }
    const boundary = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: polygon },
        { type: 'Feature', properties: {}, geometry: multiPolygon },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    } as unknown as GeoJsonCollection

    const outlines = createBoundaryOutlines(boundary)

    expect(outlines.features.map((feature) => feature.geometry.type)).toEqual(['Polygon', 'MultiPolygon'])
    expect(outlines.features.every((feature) => feature.properties.__layer === 'boundary-outline')).toBe(true)
  })
})
