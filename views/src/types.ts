export interface Client {
  id: string
  ip: string
  first_seen: number
  last_seen: number
  status: string
  message_count: number
}

export interface Session {
  id: string
  client_id: string
  ip: string
  port: number
  protocol: string
  status: string
  created_at: number
  last_active_at: number
  message_count: number
}

export interface RecordItem {
  seq: number
  session_id: string
  time_nano: number
  tag: string[]
  message: string
  data: unknown
  received_at: number
}

export interface MessageEvent extends RecordItem {
  ip: string
  port: number
  protocol: string
}

export interface Connection extends Client {
  session_count: number
  active_sessions: number
}

export interface BucketPoint {
  ts: number
  count: number
}

export interface Overview {
  total_messages: number
  qps: number
  active_connections: number
  active_sessions: number
  total_connections: number
  total_sessions: number
  buckets: BucketPoint[]
}

export interface MessagesResponse {
  total: number
  items: RecordItem[]
}

export type WsEvent =
  | { type: 'message'; data: MessageEvent }
  | { type: 'session'; data: Session }
  | { type: 'connection'; data: Client }
  | { type: 'paused'; data: { paused: boolean } }
  | { type: string; data: unknown }
