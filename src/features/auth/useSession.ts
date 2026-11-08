import { queryOptions, useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '../../lib/apiConfig'
import { LoginRequiredError, fetchPopulationAvailability } from '../population/populationApi'

export type Session = { username: string; role: 'admin' | 'user' }

async function fetchSession(): Promise<Session | null> {
  const response = await fetch(`${API_BASE_URL}/admin/session`, { credentials: 'include' })
  return response.ok ? await response.json() as Session : null
}

// 로그인 상태를 화면 여러 곳에서 공유합니다. 비로그인은 오류가 아니라 null입니다.
export function useSession() {
  return useQuery({ queryKey: ['session'], queryFn: fetchSession, retry: false, staleTime: 5 * 60 * 1000 })
}

export const availabilityQueryOptions = queryOptions({
  queryKey: ['population-availability'],
  queryFn: fetchPopulationAvailability,
  staleTime: 60_000,
})

// 세션이 없고 서버가 로그인을 요구(401)하면 잠금 상태입니다. 서버 오류는 잠금이 아니라 각 화면의 오류로 보여 줍니다.
export function useAccessState(): 'checking' | 'locked' | 'open' {
  const session = useSession()
  const availability = useQuery(availabilityQueryOptions)
  if (session.data) return 'open'
  if (session.isPending || availability.isPending) return 'checking'
  return availability.error instanceof LoginRequiredError ? 'locked' : 'open'
}
