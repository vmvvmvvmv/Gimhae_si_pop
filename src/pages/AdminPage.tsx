import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL } from '../lib/apiConfig'
import { loginUrlFor } from '../lib/authRedirect'
import './AdminPage.css'

type SyncJob = {
  id: string
  level: 'admin' | 'legal'
  fromYm: string
  toYm: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown'
  startedAt: number | null
  finishedAt: number | null
  exitCode: number | null
  output: string
}

type Account = {
  username: string
  role: 'admin' | 'user'
  isActive: boolean
  createdAt: number
}

type Session = { username: string; role: 'admin' | 'user' }

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({})) as { detail?: string }
  return body.detail || fallback
}

export default function AdminPage() {
  const [state, setState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [level, setLevel] = useState<'admin' | 'legal'>('admin')
  const [fromYm, setFromYm] = useState('2026-08')
  const [toYm, setToYm] = useState('2026-08')
  const [jobs, setJobs] = useState<SyncJob[]>([])
  const [syncError, setSyncError] = useState('')
  const [syncing, setSyncing] = useState(false)

  const isAdmin = session?.role === 'admin'

  const loadJobs = async () => {
    const response = await fetch(`${API_BASE_URL}/admin/sync`, { credentials: 'include' })
    if (!response.ok) throw new Error('jobs')
    const body = await response.json() as { items: SyncJob[] }
    setJobs(body.items)
  }

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/session`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('unauthenticated')
        setSession(await response.json() as Session)
        setState('authenticated')
      })
      .catch(() => setState('unauthenticated'))
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    fetch(`${API_BASE_URL}/admin/sync`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('jobs'))))
      .then((body: { items: SyncJob[] }) => setJobs(body.items))
      .catch(() => setSyncError('최근 작업을 불러오지 못했습니다.'))
  }, [isAdmin])

  // 동기화가 실행 중일 때만 상태를 확인합니다. 한가할 때 2초마다 요청하지 않습니다.
  const hasActiveJob = jobs.some((job) => job.status === 'queued' || job.status === 'running')
  useEffect(() => {
    if (!isAdmin || !hasActiveJob) return undefined
    const timer = window.setInterval(() => {
      void loadJobs().catch(() => setSyncError('최근 작업을 불러오지 못했습니다.'))
    }, 2000)
    return () => window.clearInterval(timer)
  }, [isAdmin, hasActiveJob])

  if (state === 'loading') return <main className="admin-page"><p>관리자 인증 확인 중…</p></main>
  if (state === 'unauthenticated' || !session) {
    return (
      <main className="admin-page">
        <h1>관리자 페이지</h1>
        <p>로그인이 필요합니다.</p>
        <a href={loginUrlFor('/admin')}>로그인으로 이동</a>
      </main>
    )
  }

  const logout = async () => {
    await fetch(`${API_BASE_URL}/admin/logout`, { method: 'POST', credentials: 'include' })
    window.location.assign('/login')
  }

  if (!isAdmin) {
    return (
      <main className="admin-page">
        <h1>관리자 페이지</h1>
        <p>{session.username}님은 관리자 권한이 없어 이 페이지를 사용할 수 없습니다.</p>
        <button type="button" onClick={logout}>로그아웃</button>
      </main>
    )
  }

  const startSync = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSyncError('')
    setSyncing(true)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/sync/population`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          from_ym: fromYm.replace('-', ''),
          to_ym: toYm.replace('-', ''),
        }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, '동기화를 시작하지 못했습니다.'))
      await loadJobs()
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : '동기화를 시작하지 못했습니다.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <main className="admin-page">
      <h1>관리자 페이지</h1>
      <p>{session.username}님으로 로그인했습니다.</p>
      <h2>인구 데이터 동기화</h2>
      <p>최대 24개월 범위만 실행할 수 있으며, 실행 중에는 다른 동기화를 시작할 수 없습니다.</p>
      <form onSubmit={startSync}>
        <label>
          지역 구분
          <select value={level} onChange={(event) => setLevel(event.target.value as 'admin' | 'legal')}>
            <option value="admin">행정동</option>
            <option value="legal">법정동</option>
          </select>
        </label>
        <label>
          시작월
          <input type="month" value={fromYm} onChange={(event) => setFromYm(event.target.value)} required />
        </label>
        <label>
          종료월
          <input type="month" value={toYm} onChange={(event) => setToYm(event.target.value)} required />
        </label>
        <button type="submit" disabled={syncing}>{syncing ? '요청 중…' : '동기화 시작'}</button>
      </form>
      {syncError && <p role="alert">{syncError}</p>}
      <h2>최근 작업</h2>
      {jobs.length === 0 && <p>실행한 동기화가 없습니다.</p>}
      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            {job.level === 'admin' ? '행정동' : '법정동'} {job.fromYm}~{job.toYm} · {job.status === 'unknown' ? '결과 확인 필요 (서버 종료)' : job.status}
            {job.startedAt && <span> · 시작 {new Date(job.startedAt * 1000).toLocaleString('ko-KR')}</span>}
            {job.finishedAt && <span> · 종료 {new Date(job.finishedAt * 1000).toLocaleString('ko-KR')}</span>}
            {job.output && <pre>{job.output}</pre>}
          </li>
        ))}
      </ul>
      <RequestsPanel kind="signup" title="회원가입 신청" />
      <RequestsPanel kind="reset" title="비밀번호 재설정 요청" />
      <AccountsPanel currentUsername={session.username} />
      <AuditPanel />
      <button type="button" onClick={logout}>로그아웃</button>
    </main>
  )
}

type AuditItem = {
  at: number
  actor: string
  action: string
  target: string | null
  ip: string | null
}

const AUDIT_LABELS: Record<string, string> = {
  login_success: '로그인 성공',
  login_failed: '로그인 실패',
  logout: '로그아웃',
  user_create: '계정 생성',
  user_delete: '계정 삭제',
  user_activate: '계정 활성화',
  user_deactivate: '계정 비활성화',
  user_password_reset: '비밀번호 재설정(관리자)',
  signup_approve: '가입 승인',
  signup_reject: '가입 거절',
  reset_code_issue: '재설정 코드 발급',
  reset_reject: '재설정 거절',
  password_reset_completed: '비밀번호 재설정 완료',
  password_changed: '비밀번호 변경',
  sync_start: '동기화 시작',
  admin_recovery: '서버 명령으로 관리자 복구',
}

function AuditPanel() {
  const [items, setItems] = useState<AuditItem[]>([])
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/audit`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response, '작업 기록을 불러오지 못했습니다.'))
        return response.json() as Promise<{ items: AuditItem[] }>
      })
      .then((body) => {
        setItems(body.items)
        setError('')
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : '작업 기록을 불러오지 못했습니다.'))
  }, [reloadKey])

  return (
    <section>
      <h2>작업 기록</h2>
      <p>최근 100건입니다. 비밀번호와 재설정 코드는 기록하지 않습니다.</p>
      <button type="button" onClick={() => setReloadKey((key) => key + 1)}>새로고침</button>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 && !error && <p>기록이 없습니다.</p>}
      {items.length > 0 && (
        <table>
          <thead>
            <tr><th>시각</th><th>작업자</th><th>작업</th><th>대상</th><th>IP</th></tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.at}-${index}`}>
                <td>{new Date(item.at * 1000).toLocaleString('ko-KR')}</td>
                <td>{item.actor}</td>
                <td>{AUDIT_LABELS[item.action] ?? item.action}</td>
                <td>{item.target ?? '-'}</td>
                <td>{item.ip ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

type AccountRequestItem = {
  kind: 'signup' | 'reset'
  username: string
  createdAt: number
  codeIssued: boolean
}

function RequestsPanel({ kind, title }: { kind: 'signup' | 'reset'; title: string }) {
  const [items, setItems] = useState<AccountRequestItem[]>([])
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<{ username: string; code: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/requests?kind=${kind}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response, '요청 목록을 불러오지 못했습니다.'))
        return response.json() as Promise<{ items: AccountRequestItem[] }>
      })
      .then((body) => setItems(body.items))
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : '요청 목록을 불러오지 못했습니다.'))
  }, [kind, reloadKey])

  const act = async (path: string, fallback: string): Promise<Response | null> => {
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/admin/requests/${path}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await errorMessage(response, fallback))
      setReloadKey((key) => key + 1)
      return response
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : fallback)
      return null
    }
  }

  const approve = async (item: AccountRequestItem) => {
    const response = await act(
      `${kind}/${encodeURIComponent(item.username)}/approve`,
      '승인하지 못했습니다.',
    )
    if (response && kind === 'reset') {
      const body = await response.json() as { code: string }
      setIssued({ username: item.username, code: body.code })
    }
  }

  const reject = (item: AccountRequestItem) =>
    void act(`${kind}/${encodeURIComponent(item.username)}/reject`, '거절하지 못했습니다.')

  return (
    <section>
      <h2>{title}</h2>
      {kind === 'signup' && <p>승인하면 일반 사용자 계정이 만들어지고, 그 아이디로 로그인할 수 있습니다.</p>}
      {kind === 'reset' && <p>승인하면 일회용 코드가 화면에 한 번만 나옵니다. 사용자에게 직접 전달하세요(30분 유효).</p>}
      {error && <p role="alert">{error}</p>}
      {issued && (
        <div role="status">
          <p>{issued.username}의 재설정 코드: <strong>{issued.code}</strong></p>
          <button type="button" onClick={() => setIssued(null)}>확인했습니다(화면에서 지우기)</button>
        </div>
      )}
      {items.length === 0 && <p>대기 중인 요청이 없습니다.</p>}
      <ul>
        {items.map((item) => (
          <li key={item.username}>
            {item.username} · 신청 {new Date(item.createdAt * 1000).toLocaleString('ko-KR')}
            {kind === 'reset' && item.codeIssued && ' · 코드 발급됨(재승인하면 새 코드)'}{' '}
            <button type="button" onClick={() => void approve(item)}>
              {kind === 'signup' ? '승인' : '코드 발급'}
            </button>{' '}
            <button type="button" onClick={() => reject(item)}>거절</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AccountsPanel({ currentUsername }: { currentUsername: string }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')

  const load = async () => {
    const response = await fetch(`${API_BASE_URL}/admin/users`, { credentials: 'include' })
    if (!response.ok) throw new Error(await errorMessage(response, '계정 목록을 불러오지 못했습니다.'))
    const body = await response.json() as { items: Account[] }
    setAccounts(body.items)
  }

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/users`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response, '계정 목록을 불러오지 못했습니다.'))
        return response.json() as Promise<{ items: Account[] }>
      })
      .then((body) => setAccounts(body.items))
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : '계정 목록을 불러오지 못했습니다.'))
  }, [])

  const run = async (request: () => Promise<Response>, fallback: string) => {
    setError('')
    try {
      const response = await request()
      if (!response.ok) throw new Error(await errorMessage(response, fallback))
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : fallback)
    }
  }

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await run(() => fetch(`${API_BASE_URL}/admin/users`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    }), '계정을 만들지 못했습니다.')
    setNewUsername('')
    setNewPassword('')
  }

  const toggleActive = (account: Account) => run(() => fetch(
    `${API_BASE_URL}/admin/users/${encodeURIComponent(account.username)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !account.isActive }),
    },
  ), '상태를 바꾸지 못했습니다.')

  const deleteAccount = (account: Account) => {
    const confirmed = window.confirm(
      `${account.username} 계정을 삭제할까요?\n\n삭제하면 되돌릴 수 없고, 이 계정의 로그인과 대기 중인 요청도 함께 지워집니다.`,
    )
    if (!confirmed) return
    return run(() => fetch(
      `${API_BASE_URL}/admin/users/${encodeURIComponent(account.username)}`,
      { method: 'DELETE', credentials: 'include' },
    ), '계정을 삭제하지 못했습니다.')
  }

  const resetPassword = (account: Account) => {
    const password = window.prompt(`${account.username}의 새 비밀번호(10자 이상)를 입력하세요.`)
    if (!password) return
    void run(() => fetch(
      `${API_BASE_URL}/admin/users/${encodeURIComponent(account.username)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      },
    ), '비밀번호를 바꾸지 못했습니다.')
  }

  return (
    <section>
      <h2>계정 관리</h2>
      <p>기능을 쓰려면 여기서 만든 계정으로 로그인해야 합니다. 비활성화하거나 비밀번호를 바꾸면 그 계정의 로그인이 바로 끊깁니다.</p>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={create}>
        <label>
          아이디(영문·숫자·._- , 3~50자)
          <input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} required />
        </label>
        <label>
          초기 비밀번호(10자 이상)
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required />
        </label>
        <label>
          역할
          <select value={newRole} onChange={(event) => setNewRole(event.target.value as 'admin' | 'user')}>
            <option value="user">일반 사용자</option>
            <option value="admin">관리자</option>
          </select>
        </label>
        <button type="submit">계정 만들기</button>
      </form>
      <p>
        전체 {accounts.length}명 · 사용 중 {accounts.filter((a) => a.isActive).length}명 · 관리자 {accounts.filter((a) => a.role === 'admin').length}명
      </p>
      <table>
        <thead>
          <tr><th>아이디</th><th>역할</th><th>상태</th><th>가입일</th><th>관리</th></tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const isSelf = account.username === currentUsername
            return (
              <tr key={account.username}>
                <td>{account.username}{isSelf && ' (나)'}</td>
                <td>{account.role === 'admin' ? '관리자' : '일반 사용자'}</td>
                <td>{account.isActive ? '사용 중' : '비활성'}</td>
                <td>{new Date(account.createdAt * 1000).toLocaleDateString('ko-KR')}</td>
                <td>
                  <button type="button" onClick={() => void toggleActive(account)}>
                    {account.isActive ? '비활성화' : '활성화'}
                  </button>{' '}
                  <button type="button" onClick={() => resetPassword(account)}>비밀번호 재설정</button>{' '}
                  <button
                    type="button"
                    onClick={() => void deleteAccount(account)}
                    disabled={isSelf}
                    title={isSelf ? '지금 로그인한 계정은 삭제할 수 없습니다.' : undefined}
                  >
                    계정 삭제
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
