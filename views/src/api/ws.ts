import { useStore } from '../store/store'
import type { WsEvent } from '../types'

type Listener = (ev: WsEvent) => void

class WSClient {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private reconnectTimer: number | null = null
  private sessionFilter = ''
  private connectionFilter = ''
  private closed = false

  connect() {
    this.closed = false
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${location.host}/ws`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      useStore.getState().setWsConnected(true)
      this.sendFilter()
    }
    this.ws.onclose = () => {
      useStore.getState().setWsConnected(false)
      if (!this.closed) this.scheduleReconnect()
    }
    this.ws.onerror = () => {
      this.ws?.close()
    }
    this.ws.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as WsEvent
        if (ev.type === 'paused') {
          useStore.getState().setPaused((ev.data as { paused: boolean }).paused)
        }
        this.listeners.forEach((fn) => fn(ev))
      } catch {
        /* ignore malformed */
      }
    }
  }

  subscribe(sessionId: string, connectionId: string) {
    this.sessionFilter = sessionId
    this.connectionFilter = connectionId
    this.sendFilter()
  }

  private sendFilter() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    if (this.sessionFilter || this.connectionFilter) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          session_id: this.sessionFilter,
          connection_id: this.connectionFilter,
        }),
      )
    } else {
      this.ws.send(JSON.stringify({ type: 'unsubscribe' }))
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 2000)
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const ws = new WSClient()
