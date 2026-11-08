import { API_BASE_URL } from './apiConfig'

// POST 요청을 보내고, 실패하면 서버가 준 메시지로 오류를 던집니다.
export async function postJson(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.ok) return
  const data = await response.json().catch(() => ({})) as { detail?: string }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'))
    throw new Error(Number.isFinite(seconds) && seconds > 0
      ? `요청이 많습니다. ${seconds}초 후 다시 시도해 주세요.`
      : data.detail || '잠시 후 다시 시도해 주세요.')
  }
  throw new Error(data.detail || '요청을 처리하지 못했습니다.')
}
