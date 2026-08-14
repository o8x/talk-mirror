import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Card,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import TrendChart from '../components/TrendChart'
import { getConnections, getMessages, getSessions } from '../api/client'
import { ws } from '../api/ws'
import { formatTime, nowNano } from '../utils'
import { useT } from '../i18n'
import type { Connection, MessageEvent, Session } from '../types'

const MAX_LIVE = 10000

const ranges = [
  { label: 'Live', seconds: 0 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
  { label: '1d', seconds: 86400 },
]

function Row({ m, t }: { m: MessageEvent; t: (k: string) => string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontFamily: 'monospace' }}>{m.ip}</TableCell>
        <TableCell sx={{ fontFamily: 'monospace' }}>{m.port}</TableCell>
        <TableCell>
          {(m.tag ?? []).map((tag) => (
            <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ mr: 0.5 }} />
          ))}
        </TableCell>
        <TableCell>{m.message}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
          {formatTime(m.time_nano)}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell sx={{ py: 0 }} colSpan={6}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, pl: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('sessions.detail')}
              </Typography>
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  color: 'inherit',
                }}
              >
                {JSON.stringify(
                  {
                    time_nano: m.time_nano,
                    tag: m.tag,
                    message: m.message,
                    data: m.data,
                    seq: m.seq,
                    received_at: m.received_at,
                  },
                  null,
                  2,
                )}
              </pre>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

export default function Sessions() {
  const t = useT()
  const [connections, setConnections] = useState<Connection[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [selConn, setSelConn] = useState('')
  const [selSession, setSelSession] = useState('')
  const [messages, setMessages] = useState<MessageEvent[]>([])
  const [total, setTotal] = useState(0)
  const [rangeSeconds, setRangeSeconds] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(100)

  const refreshSessions = useCallback(async () => {
    try {
      const [cs, ss] = await Promise.all([getConnections(), getSessions()])
      setConnections(cs)
      setSessions(ss)
      return ss
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    refreshSessions().then((ss) => {
      if (ss.length === 0) return
      // The list is sorted by last_active_at descending, so the first entry is
      // the most recently active session (selected even if a single session).
      const recent = ss[0]
      setSelConn(recent.client_id)
      setSelSession(recent.id)
    })
  }, [refreshSessions])

  // keep session list fresh on connection/session events
  useEffect(() => {
    const off = ws.on((ev) => {
      if (ev.type === 'session' || ev.type === 'connection') {
        refreshSessions()
      }
    })
    return off
  }, [refreshSessions])

  // subscribe to the selected session
  useEffect(() => {
    ws.subscribe(selSession, '')
  }, [selSession])

  // fetch data when selection or range or pagination changes
  useEffect(() => {
    let alive = true
    if (!selSession) {
      setMessages([])
      setTotal(0)
      return
    }
    if (rangeSeconds > 0) {
      const end = nowNano()
      const start = end - rangeSeconds * 1e9
      getMessages(selSession, { start, end, limit: pageSize, offset: page * pageSize })
        .then((res) => {
          if (!alive) return
          setTotal(res.total)
          setMessages(res.items as MessageEvent[])
        })
        .catch(() => {})
    } else {
      // live mode: seed with recent history
      getMessages(selSession, { limit: 500 })
        .then((res) => {
          if (!alive) return
          setTotal(res.total)
          setMessages(res.items as MessageEvent[])
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [selSession, rangeSeconds, page, pageSize])

  // realtime push
  useEffect(() => {
    const off = ws.on((ev) => {
      if (ev.type !== 'message') return
      const m = ev.data as MessageEvent
      if (rangeSeconds > 0) return
      if (selSession && m.session_id !== selSession) return
      setMessages((prev) => [m, ...prev].slice(0, MAX_LIVE))
      setTotal((t) => t + 1)
    })
    return off
  }, [selSession, rangeSeconds])

  const trendData = useMemo(() => {
    const buckets = new Map<number, number>()
    const size = 1e9
    for (const m of messages) {
      const key = Math.floor(m.time_nano / size) * size
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return [...buckets.entries()]
      .map(([ts, count]) => ({ ts, count }))
      .sort((a, b) => a.ts - b.ts)
  }, [messages])

  const filteredSessions = useMemo(() => {
    if (!selConn) return sessions
    return sessions.filter((s) => s.client_id === selConn)
  }, [sessions, selConn])

  const pageMessages = useMemo(() => {
    if (rangeSeconds > 0) return messages
    const start = page * pageSize
    return messages.slice(start, start + pageSize)
  }, [messages, page, pageSize, rangeSeconds])

  const handleBrush = useCallback(
    (startNs: number, endNs: number) => {
      if (!selSession) return
      setPage(0)
      getMessages(selSession, { start: startNs, end: endNs, limit: pageSize, offset: 0 })
        .then((res) => {
          setTotal(res.total)
          setMessages(res.items as MessageEvent[])
        })
        .catch(() => {})
    },
    [selSession, pageSize],
  )

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{t('sessions.connection')}</InputLabel>
          <Select
            value={selConn}
            label={t('sessions.connection')}
            onChange={(e) => {
              const cid = e.target.value
              setSelConn(cid)
              const first = sessions.find((s) => s.client_id === cid)
              setSelSession(first?.id ?? '')
            }}
          >
            <MenuItem value="">{t('common.all')}</MenuItem>
            {connections.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.ip}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{t('sessions.session')}</InputLabel>
          <Select
            value={selSession}
            label={t('sessions.session')}
            onChange={(e) => setSelSession(e.target.value)}
          >
            <MenuItem value="">{t('common.none')}</MenuItem>
            {filteredSessions.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.ip}:{s.port}/{s.protocol}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={0.5}>
          {ranges.map((r) => (
            <Chip
              key={r.label}
              label={r.label === 'Live' ? t('sessions.live') : r.label}
              size="small"
              color={rangeSeconds === r.seconds ? 'primary' : 'default'}
              variant={rangeSeconds === r.seconds ? 'filled' : 'outlined'}
              onClick={() => {
                setRangeSeconds(r.seconds)
                setPage(0)
              }}
            />
          ))}
        </Stack>
      </Stack>

      <Card sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {rangeSeconds > 0
            ? t('sessions.windowMessages', { s: rangeSeconds })
            : t('sessions.liveMessages')}{' '}
          · {t('sessions.brushHint')}
        </Typography>
        <TrendChart data={trendData} height={220} brushable onBrush={handleBrush} />
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>{t('sessions.ip')}</TableCell>
                <TableCell>{t('sessions.port')}</TableCell>
                <TableCell>{t('sessions.tag')}</TableCell>
                <TableCell>{t('sessions.message')}</TableCell>
                <TableCell>{t('sessions.time')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageMessages.map((m) => (
                <Row key={`${m.session_id}-${m.seq}`} m={m} t={t} />
              ))}
              {pageMessages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    {t('sessions.noMessages')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(parseInt(e.target.value, 10))
            setPage(0)
          }}
          rowsPerPageOptions={[10, 100, 1000]}
        />
      </Card>
    </Box>
  )
}
