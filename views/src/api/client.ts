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

export function login(key: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ key }),
  })
}

export function getOverview(opts: { seconds?: number; start?: number; end?: number } = {}): Promise<Overview> {
  const p = new URLSearchParams()
  if (opts.seconds) p.set('seconds', String(opts.seconds))
  if (opts.start) p.set('start', String(opts.start))
  if (opts.end) p.set('end', String(opts.end))
  return request<Overview>(`/api/stats/overview?${p.toString()}`)
}

export function getConnections(): Promise<Connection[]> {
  return request<Connection[]>('/api/connections')
}

export function getSessions(clientId?: string): Promise<Session[]> {
  const q = clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''
  return request<Session[]>(`/api/sessions${q}`)
}

export function getMessages(
  sessionId: string,
  opts: { start?: number; end?: number; limit?: number; offset?: number } = {},
): Promise<MessagesResponse> {
  const p = new URLSearchParams()
  if (opts.start) p.set('start', String(opts.start))
  if (opts.end) p.set('end', String(opts.end))
  p.set('limit', String(opts.limit ?? 100))
  p.set('offset', String(opts.offset ?? 0))
  return request<MessagesResponse>(`/api/sessions/${sessionId}/messages?${p.toString()}`)
}

export function getSessionBuckets(
  sessionId: string,
  opts: { seconds?: number; start?: number; end?: number } = {},
): Promise<BucketPoint[]> {
  const p = new URLSearchParams()
  if (opts.seconds) p.set('seconds', String(opts.seconds))
  if (opts.start) p.set('start', String(opts.start))
  if (opts.end) p.set('end', String(opts.end))
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
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`${baseUrl}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })
}
