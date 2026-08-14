import type { BucketPoint, Connection, MessagesResponse, Overview, Session } from '../types'

const KEY_STORAGE = 'talk-mirror-key'

export function getStoredKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? ''
}

export function setStoredKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key)
}

export function clearStoredKey() {
  localStorage.removeItem(KEY_STORAGE)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const key = getStoredKey()
  if (key && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${key}`)
  }
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function login(key: string): Promise<{ ok: boolean; ip: string }> {
  return request<{ ok: boolean; ip: string }>('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ key }),
  })
}

export function getOverview(
  opts: { seconds?: number; start?: number; end?: number; points?: number } = {},
): Promise<Overview> {
  const p = new URLSearchParams()
  if (opts.seconds) p.set('seconds', String(opts.seconds))
  if (opts.start) p.set('start', String(opts.start))
  if (opts.end) p.set('end', String(opts.end))
  if (opts.points) p.set('points', String(opts.points))
  return request<Overview>(`/api/stats/overview?${p.toString()}`)
}

export function getConnections(): Promise<Connection[]> {
  return request<Connection[]>('/api/connections')
}

export function getSessions(clientId?: string): Promise<Session[]> {
  const q = clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''
  return request<Session[]>(`/api/sessions${q}`)
}

export function deleteConnection(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/connections/${id}`, { method: 'DELETE' })
}

export function deleteSession(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' })
}

export function getMessages(
  sessionId: string,
  opts: {
    start?: number
    end?: number
    limit?: number
    offset?: number
    q?: string
    tag?: string
    dataKey?: string
    dataValue?: string
  } = {},
): Promise<MessagesResponse> {
  const p = new URLSearchParams()
  if (opts.start) p.set('start', String(opts.start))
  if (opts.end) p.set('end', String(opts.end))
  if (opts.q) p.set('q', opts.q)
  if (opts.tag) p.set('tag', opts.tag)
  if (opts.dataKey) p.set('data_key', opts.dataKey)
  if (opts.dataValue) p.set('data_value', opts.dataValue)
  p.set('limit', String(opts.limit ?? 100))
  p.set('offset', String(opts.offset ?? 0))
  return request<MessagesResponse>(`/api/sessions/${sessionId}/messages?${p.toString()}`)
}

// exportSession downloads a session and all of its messages as JSON or CSV.
export async function exportSession(sessionId: string, format: 'json' | 'csv'): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/export?format=${format}`, {
    headers: { Authorization: `Bearer ${getStoredKey()}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `session-${sessionId}.${format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function getSessionBuckets(
  sessionId: string,
  opts: { seconds?: number; start?: number; end?: number; points?: number } = {},
): Promise<BucketPoint[]> {
  const p = new URLSearchParams()
  if (opts.seconds) p.set('seconds', String(opts.seconds))
  if (opts.start) p.set('start', String(opts.start))
  if (opts.end) p.set('end', String(opts.end))
  if (opts.points) p.set('points', String(opts.points))
  return request<BucketPoint[]>(`/api/sessions/${sessionId}/buckets?${p.toString()}`)
}

export function getSettings(): Promise<Record<string, string>> {
  return request<Record<string, string>>('/api/settings')
}

export function saveSettings(body: Record<string, string>): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function setPause(paused: boolean): Promise<{ paused: boolean }> {
  return request<{ paused: boolean }>('/api/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paused }),
  })
}

export function getCode(lang: string): Promise<{ lang: string; class: string; app: string }> {
  return request<{ lang: string; class: string; app: string }>(`/api/code/${lang}`)
}

export function sendTestMessage(
  baseUrl: string,
  body: { tag?: string[]; message: string; data?: Record<string, string> },
  key: string,
): Promise<{ ok: boolean; ip: string; port: number }> {
  return request<{ ok: boolean; ip: string; port: number }>(`${baseUrl}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })
}
