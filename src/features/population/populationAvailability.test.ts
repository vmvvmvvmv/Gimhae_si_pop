import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginRequiredError, fetchPopulationAvailability } from './populationApi'

describe('fetchPopulationAvailability', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('401만 로그인 필요로 구분한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(fetchPopulationAvailability()).rejects.toBeInstanceOf(LoginRequiredError)
  })

  it('서버 오류는 로그인 필요로 처리하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await expect(fetchPopulationAvailability()).rejects.not.toBeInstanceOf(LoginRequiredError)
  })
})
