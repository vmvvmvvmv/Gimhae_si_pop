import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const DATA_DIRECTORY = resolve('public/data')
const ensureOnly = process.argv.includes('--ensure')

const TARGETS = [
  ['gimhae_hangjeongdong.geojson', 'gimhae_hangjeongdong.render.geojson', 0.000025],
  // 법정동 원본만 EPSG:5186(미터 단위) 좌표라 허용 오차도 미터로 지정합니다.
  ['Gimhae_si.geojson', 'Gimhae_si.render.geojson', 3],
  ['gimhae_waterways.geojson', 'gimhae_waterways.render.geojson', 0.00003],
  ['gimhae_major_roads.geojson', 'gimhae_major_roads.render.geojson', 0.00002],
  ['gimhae_development_areas.geojson', 'gimhae_development_areas.render.geojson', 0.00002],
]

function getSquaredDistance(left, right) {
  const x = left[0] - right[0]
  const y = left[1] - right[1]
  return x * x + y * y
}

function getSquaredSegmentDistance(point, start, end) {
  let x = start[0]
  let y = start[1]
  let dx = end[0] - x
  let dy = end[1] - y

  if (dx !== 0 || dy !== 0) {
    const projection =
      ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy)
    if (projection > 1) {
      x = end[0]
      y = end[1]
    } else if (projection > 0) {
      x += dx * projection
      y += dy * projection
    }
  }

  dx = point[0] - x
  dy = point[1] - y
  return dx * dx + dy * dy
}

function simplifySegment(points, first, last, squaredTolerance, kept) {
  let furthestIndex = -1
  let maximumDistance = squaredTolerance

  for (let index = first + 1; index < last; index += 1) {
    const distance = getSquaredSegmentDistance(
      points[index],
      points[first],
      points[last],
    )
    if (distance > maximumDistance) {
      furthestIndex = index
      maximumDistance = distance
    }
  }

  if (furthestIndex === -1) return
  if (furthestIndex - first > 1) {
    simplifySegment(points, first, furthestIndex, squaredTolerance, kept)
  }
  kept.push(points[furthestIndex])
  if (last - furthestIndex > 1) {
    simplifySegment(points, furthestIndex, last, squaredTolerance, kept)
  }
}

function simplifyOpenLine(points, tolerance) {
  if (points.length <= 2) return points
  const kept = [points[0]]
  simplifySegment(points, 0, points.length - 1, tolerance * tolerance, kept)
  kept.push(points.at(-1))
  return kept
}

function simplifyRing(ring, tolerance) {
  if (ring.length <= 5) return ring
  const points = getSquaredDistance(ring[0], ring.at(-1)) === 0
    ? ring.slice(0, -1)
    : [...ring]
  if (points.length <= 4) return ring

  let splitIndex = 1
  let maximumDistance = -1
  for (let index = 1; index < points.length; index += 1) {
    const distance = getSquaredDistance(points[0], points[index])
    if (distance > maximumDistance) {
      splitIndex = index
      maximumDistance = distance
    }
  }

  const firstHalf = simplifyOpenLine(points.slice(0, splitIndex + 1), tolerance)
  const secondHalf = simplifyOpenLine(
    [...points.slice(splitIndex), points[0]],
    tolerance,
  )
  const simplified = [...firstHalf, ...secondHalf.slice(1)]
  return simplified.length >= 4 ? simplified : ring
}

function simplifyGeometry(geometry, tolerance) {
  if (!geometry) return geometry
  const simplifyPolygon = (polygon) =>
    polygon.map((ring) => simplifyRing(ring, tolerance))

  switch (geometry.type) {
    case 'LineString':
      return { ...geometry, coordinates: simplifyOpenLine(geometry.coordinates, tolerance) }
    case 'MultiLineString':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((line) =>
          simplifyOpenLine(line, tolerance),
        ),
      }
    case 'Polygon':
      return { ...geometry, coordinates: simplifyPolygon(geometry.coordinates) }
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(simplifyPolygon),
      }
    default:
      return geometry
  }
}

function countCoordinatePairs(value) {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    return 1
  }
  return Array.isArray(value)
    ? value.reduce((sum, item) => sum + countCoordinatePairs(item), 0)
    : 0
}

for (const [sourceName, outputName, tolerance] of TARGETS) {
  const sourcePath = resolve(DATA_DIRECTORY, sourceName)
  const outputPath = resolve(DATA_DIRECTORY, outputName)
  const collection = JSON.parse(await readFile(sourcePath, 'utf8'))
  const sourcePointCount = collection.features.reduce(
    (sum, feature) => sum + countCoordinatePairs(feature.geometry?.coordinates),
    0,
  )
  const optimized = {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: simplifyGeometry(feature.geometry, tolerance),
    })),
  }
  const optimizedPointCount = optimized.features.reduce(
    (sum, feature) => sum + countCoordinatePairs(feature.geometry?.coordinates),
    0,
  )
  const optimizedContents = JSON.stringify(optimized)
  if (ensureOnly) {
    let existingContents
    try {
      existingContents = await readFile(outputPath, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await writeFile(outputPath, optimizedContents)
    }
    if (existingContents !== undefined && existingContents !== optimizedContents) {
      throw new Error(
        `${outputName}이 원본 데이터로 생성한 결과와 다릅니다. ` +
        '파일을 확인한 뒤 npm run optimize:geojson으로 다시 생성해 주세요.',
      )
    }
  } else {
    await writeFile(outputPath, optimizedContents)
  }
  const reduction = Math.round((1 - optimizedPointCount / sourcePointCount) * 100)
  console.log(
    `${sourceName}: ${sourcePointCount.toLocaleString()} → ` +
      `${optimizedPointCount.toLocaleString()} points (${reduction}% 감소)`,
  )
}
