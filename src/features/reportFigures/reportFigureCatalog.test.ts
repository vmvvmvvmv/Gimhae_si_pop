import { describe, expect, it } from 'vitest'
import { REPORT_FIGURES } from './reportFigureCatalog'

describe('GIS 정보 목록', () => {
  it('일반 표·그래프를 제외하고 GIS 지도만 다룬다', () => {
    const numbered = REPORT_FIGURES.filter((figure) => /^\d-\d+$/.test(figure.id))
    expect(numbered).toHaveLength(25)
    expect(new Set(numbered.map((figure) => figure.id)).size).toBe(25)
    expect(numbered.filter((figure) => figure.kind)).toHaveLength(13)
    expect(numbered.map((figure) => figure.id)).not.toContain('1-4')
    expect(numbered.map((figure) => figure.id)).not.toContain('1-5')
    expect(numbered.map((figure) => figure.id)).not.toContain('1-19')
    expect(numbered.map((figure) => figure.id)).not.toContain('2-1')
    expect(numbered.find((figure) => figure.id === '1-12')?.kind).toBe('park-access')
    expect(numbered.find((figure) => figure.id === '1-13')?.missingSource).toContain('토지피복')
    expect(numbered.find((figure) => figure.id === '2-10')?.missingSource).toContain('개편안')
    expect(numbered.filter((figure) => !figure.kind).every((figure) => Boolean(figure.missingSource))).toBe(true)
  })
})
