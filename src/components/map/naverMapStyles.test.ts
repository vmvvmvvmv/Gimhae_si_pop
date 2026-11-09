import { describe, expect, it } from 'vitest'
import type { GeoJsonCollection } from '../../features/boundaries/boundaryLoader'
import { createMajorRoadOverlays } from './naverMapStyles'

function roads(coordinates: number[][][]) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiLineString', coordinates },
    }],
  } as unknown as GeoJsonCollection
}

const lineCount = (collection: GeoJsonCollection) =>
  (collection.features[0].geometry.coordinates as number[][][]).length

describe('createMajorRoadOverlays', () => {
  it('맞닿은 짧은 구간은 방향이 달라도 한 선으로 잇는다', () => {
    const result = createMajorRoadOverlays(roads([
      [[1, 0], [2, 0]],
      [[3, 0], [2, 0]],
      [[0, 0], [1, 0]],
    ]))

    expect(lineCount(result)).toBe(1)
    const line = result.features[0].geometry.coordinates as number[][][]
    expect(line[0].map(([x]) => x).sort()).toEqual([0, 1, 2, 3])
  })

  it('갈림길에서는 잇지 않아 다른 길과 합쳐지지 않는다', () => {
    const result = createMajorRoadOverlays(roads([
      [[0, 0], [1, 0]],
      [[1, 0], [2, 0]],
      [[1, 0], [1, 1]],
    ]))

    expect(lineCount(result)).toBe(3)
  })

  it('테두리와 본선 두 겹은 그대로 만든다', () => {
    const result = createMajorRoadOverlays(roads([[[0, 0], [1, 0]]]))

    expect(result.features.map((feature) => feature.properties.__layer))
      .toEqual(['major-road-casing', 'major-road-core'])
  })
})
