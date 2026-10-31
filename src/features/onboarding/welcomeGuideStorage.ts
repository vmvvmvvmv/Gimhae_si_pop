// 안내 방식이 바뀌면 버전을 올려 이전 안내를 본 사람에게도 새 안내를 한 번 보여 줍니다.
export const WELCOME_GUIDE_STORAGE_KEY = 'gimhae-gis:welcome-guide:v2'

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function shouldShowWelcomeGuide(
  storage: ReadableStorage | null = getBrowserStorage(),
): boolean {
  try {
    return storage?.getItem(WELCOME_GUIDE_STORAGE_KEY) !== 'seen'
  } catch {
    // 저장소 접근이 막혀 있어도 방문자가 안내를 볼 수 있게 합니다.
    return true
  }
}

export function rememberWelcomeGuide(
  storage: WritableStorage | null = getBrowserStorage(),
): void {
  try {
    storage?.setItem(WELCOME_GUIDE_STORAGE_KEY, 'seen')
  } catch {
    // 사생활 보호 모드 등에서 저장에 실패해도 안내창은 닫힙니다.
  }
}
