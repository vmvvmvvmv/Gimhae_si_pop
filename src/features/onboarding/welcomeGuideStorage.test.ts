import { describe, expect, it, vi } from 'vitest'
import {
  rememberWelcomeGuide,
  shouldShowWelcomeGuide,
  WELCOME_GUIDE_STORAGE_KEY,
} from './welcomeGuideStorage'

describe('첫 방문 안내 기록', () => {
  it('기록이 없으면 안내를 보여 준다', () => {
    expect(shouldShowWelcomeGuide({ getItem: () => null })).toBe(true)
  })

  it('완료 또는 건너뛰기를 기록하면 다음 방문에 숨긴다', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    rememberWelcomeGuide(storage)

    expect(values.get(WELCOME_GUIDE_STORAGE_KEY)).toBe('seen')
    expect(shouldShowWelcomeGuide(storage)).toBe(false)
  })

  it('저장소가 차단돼도 오류 없이 안내를 볼 수 있다', () => {
    const getItem = vi.fn(() => { throw new Error('blocked') })
    const setItem = vi.fn(() => { throw new Error('blocked') })

    expect(shouldShowWelcomeGuide({ getItem })).toBe(true)
    expect(() => rememberWelcomeGuide({ setItem })).not.toThrow()
  })
})
