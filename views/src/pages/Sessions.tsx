import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Popover,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import SearchIcon from '@mui/icons-material/Search'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import JsonHighlight from '../components/JsonHighlight'
import TrendChart from '../components/TrendChart'
import { getConnections, getMessages, getSessions, getSessionBuckets } from '../api/client'
import { ws } from '../api/ws'
import { formatTime, nowNano, tagColor } from '../utils'
import { useT } from '../i18n'
import { useStore } from '../store/store'
import type { BucketPoint, Connection, MessageEvent, Session } from '../types'

const MAX_LIVE = 10000

interface Filters {
  q: string
  tag: string
  dataKey: string
  dataValue: string
}

const EMPTY_FILTERS: Filters = { q: '', tag: '', dataKey: '', dataValue: '' }

function hasFilters(f: Filters): boolean {
  return !!(f.q || f.tag || f.dataKey || f.dataValue)
}

type ColumnKey = 'seq' | 'time' | 'ip' | 'port' | 'tag' | 'message' | 'data'
const ALL_COLUMNS: ColumnKey[] = ['seq', 'time', 'ip', 'port', 'tag', 'message', 'data']
const DEFAULT_ORDER: ColumnKey[] = ['seq', 'time', 'ip', 'port', 'tag', 'message', 'data']
const COL_KEY = 'talk-mirror-session-columns'

// Compact fixed widths for the non-data columns; the data column absorbs all
// remaining table width.
const COLUMN_WIDTHS: Record<ColumnKey, string> = {
  seq: '60px',
  time: '150px',
  ip: '120px',
  port: '60px',
  tag: '160px',
  message: '220px',
  data: 'auto',
}

function loadOrder(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(COL_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as ColumnKey[]
      const valid = arr.filter((k) => ALL_COLUMNS.includes(k))
      if (valid.length > 0) return valid
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_ORDER]
}

const ranges = [
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
  { label: '1d', seconds: 86400 },
]

// sessionLabel renders a session as its optional name followed by address:port.
function sessionLabel(s: Session): string {
  return s.name ? `${s.name}（${s.ip}:${s.port}）` : `${s.ip}:${s.port}/${s.protocol}`
}

function JsonBlock({ value }: { value: unknown }) {
  const darkMode = useStore((s) => s.darkMode)
  return (
    <SyntaxHighlighter
      language="json"
      style={darkMode ? oneDark : oneLight}
      customStyle={{ margin: 0, background: 'transparent', fontSize: 12, lineHeight: 1.5 }}
      codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
    >
      {JSON.stringify(value, null, 2)}
    </SyntaxHighlighter>
  )
}

// renderCell renders a single message column. It lives at module scope so its
// identity is stable and memoized rows are not invalidated on every parent
// re-render.
function renderCell(key: ColumnKey, m: MessageEvent): ReactNode {
  switch (key) {
    case 'seq':
      return (
        <span
          style={{
            display: 'inline-block',
            minWidth: '6ch',
            textAlign: 'right',
            fontFamily: 'monospace',
          }}
        >
          {m.seq}
        </span>
      )
    case 'time':
      return <span style={{ whiteSpace: 'nowrap' }}>{formatTime(m.time_nano)}</span>
    case 'ip':
      return <span style={{ fontFamily: 'monospace' }}>{m.ip}</span>
    case 'port':
      return <span style={{ fontFamily: 'monospace' }}>{m.port}</span>
    case 'tag':
      return (m.tag ?? []).map((tag) => (
        <Chip
          key={tag}
          label={tag}
          size="small"
          sx={{
            mr: 0.5,
            backgroundColor: tagColor(tag),
            color: '#fff',
            fontWeight: 500,
          }}
        />
      ))
    case 'message':
      return m.message
    case 'data':
      return (
        <Typography
          variant="body2"
          component="span"
          sx={{
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
            width: '100%',
            verticalAlign: 'middle',
          }}
        >
          <JsonHighlight value={m.data} />
        </Typography>
      )
  }
}

export default function Sessions() {
  const t = useT()
  const localIp = useStore((s) => s.localIp)
  const [searchParams, setSearchParams] = useSearchParams()
  const [connections, setConnections] = useState<Connection[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [selConn, setSelConn] = useState('')
  const [selSession, setSelSession] = useState('')
  const [messages, setMessages] = useState<MessageEvent[]>([])
  const [total, setTotal] = useState(0)
  const [rangeSeconds, setRangeSeconds] = useState(0)
  const [live, setLive] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [trendData, setTrendData] = useState<BucketPoint[]>([])
  const [order, setOrder] = useState<ColumnKey[]>(loadOrder)
  const [colAnchor, setColAnchor] = useState<HTMLElement | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const columnLabel: Record<ColumnKey, string> = useMemo(
    () => ({
      seq: t('sessions.seq'),
      time: t('sessions.time'),
      ip: t('sessions.ip'),
      port: t('sessions.port'),
      tag: t('sessions.tag'),
      message: t('sessions.message'),
      data: t('sessions.data'),
    }),
    [t],
  )

  useEffect(() => {
    localStorage.setItem(COL_KEY, JSON.stringify(order))
  }, [order])

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
      const urlSession = searchParams.get('session')
      const urlConn = searchParams.get('connection')
      let target: Session | undefined
      if (urlSession) {
        target = ss.find((s) => s.id === urlSession)
      }
      if (!target) {
        // Prefer the most recent active session; otherwise select the newest one.
        const active = ss.find((s) => s.status === 'active')
        target = active ?? ss[0]
      }
      const conn = urlConn && ss.find((s) => s.client_id === urlConn) ? urlConn : target.client_id
      setSelConn(conn)
      setSelSession(target.id)
    })
  }, [refreshSessions])

  // keep the URL in sync with the current selection
  useEffect(() => {
    const params = new URLSearchParams()
    if (selConn) params.set('connection', selConn)
    if (selSession) params.set('session', selSession)
    setSearchParams(params, { replace: true })
  }, [selConn, selSession, setSearchParams])

  useEffect(() => {
    const off = ws.on((ev) => {
      if (ev.type === 'session' || ev.type === 'connection') {
        refreshSessions()
      }
    })
    return off
  }, [refreshSessions])

  useEffect(() => {
    if (live) {
      ws.subscribe(selSession, '')
    } else {
      ws.subscribe('', '')
    }
  }, [selSession, live])

  // fetch table data when selection, range, pagination, filters or live change
  useEffect(() => {
    let alive = true
    if (!live || !selSession) {
      return
    }
    const filterOpts = {
      q: filters.q || undefined,
      tag: filters.tag || undefined,
      dataKey: filters.dataKey || undefined,
      dataValue: filters.dataValue || undefined,
    }
    if (rangeSeconds > 0) {
      const end = nowNano()
      const start = end - rangeSeconds * 1e9
      getMessages(selSession, { ...filterOpts, start, end, limit: pageSize, offset: page * pageSize })
        .then((res) => {
          if (!alive) return
          setTotal(res.total)
          setMessages(res.items)
        })
        .catch(() => {})
    } else {
      getMessages(selSession, { ...filterOpts, limit: 500 })
        .then((res) => {
          if (!alive) return
          setTotal(res.total)
          setMessages(res.items)
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [selSession, rangeSeconds, page, pageSize, filters, live])

  // fetch trend buckets from the backend (full history, not just the in-memory list)
  useEffect(() => {
    if (!live || !selSession) {
      return
    }
    const seconds = rangeSeconds > 0 ? rangeSeconds : 300
    getSessionBuckets(selSession, { seconds })
      .then(setTrendData)
      .catch(() => setTrendData([]))
  }, [selSession, rangeSeconds, live])

  // Live-mode polling fallback: keep the list and trend fresh even if the
  // WebSocket push is unavailable.
  useEffect(() => {
    if (!live || !selSession || rangeSeconds > 0) return
    const timer = window.setInterval(() => {
      getMessages(selSession, {
        q: filters.q || undefined,
        tag: filters.tag || undefined,
        dataKey: filters.dataKey || undefined,
        dataValue: filters.dataValue || undefined,
        limit: 500,
      })
        .then((res) => {
          setTotal(res.total)
          setMessages(res.items)
        })
        .catch(() => {})
      getSessionBuckets(selSession, { seconds: 300 })
        .then(setTrendData)
        .catch(() => {})
    }, 1000)
    return () => window.clearInterval(timer)
  }, [selSession, rangeSeconds, filters, live])

  // realtime push
  useEffect(() => {
    const off = ws.on((ev) => {
      if (ev.type !== 'message') return
      if (!live) return
      const m = ev.data as MessageEvent
      if (rangeSeconds > 0) return
      if (hasFilters(filters)) return
      if (selSession && m.session_id !== selSession) return
      setMessages((prev) => [m, ...prev].slice(0, MAX_LIVE))
      setTotal((n) => n + 1)
    })
    return off
  }, [selSession, rangeSeconds, filters, live])

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
      if (!live || !selSession) return
      setPage(0)
      getMessages(selSession, {
        q: filters.q || undefined,
        tag: filters.tag || undefined,
        dataKey: filters.dataKey || undefined,
        dataValue: filters.dataValue || undefined,
        start: startNs,
        end: endNs,
        limit: pageSize,
        offset: 0,
      })
        .then((res) => {
          setTotal(res.total)
          setMessages(res.items)
        })
        .catch(() => {})
    },
    [selSession, pageSize, filters, live],
  )

  const toggleColumn = (key: ColumnKey) => {
    setOrder((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const moveColumn = (key: ColumnKey, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(key)
      const j = idx + dir
      if (idx < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  const hiddenColumns = ALL_COLUMNS.filter((k) => !order.includes(k))

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
                {localIp && c.ip === localIp && (
                  <Chip
                    label={t('common.localMachine')}
                    size="small"
                    color="primary"
                    variant="filled"
                    sx={{ ml: 1, height: 18 }}
                  />
                )}
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
                {sessionLabel(s)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel
          control={
            <Switch size="small" checked={live} onChange={(e) => setLive(e.target.checked)} />
          }
          label={t('sessions.live')}
          sx={{ ml: 0.5 }}
        />
        <Stack direction="row" spacing={0.5}>
          {ranges.map((r) => (
            <Chip
              key={r.label}
              label={r.label}
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
        <IconButton
          size="small"
          onClick={() => setFilterOpen((v) => !v)}
          title={t('sessions.advancedSearch')}
          color={hasFilters(filters) ? 'primary' : 'default'}
        >
          <SearchIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={(e) => setColAnchor(e.currentTarget)} title={t('sessions.columns')}>
          <ViewColumnIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Collapse in={filterOpen}>
        <Card sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <TextField
              size="small"
              label={t('sessions.keyword')}
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              sx={{ minWidth: 200 }}
            />
            <TextField
              size="small"
              label={t('sessions.tagFilter')}
              value={draft.tag}
              onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))}
              sx={{ minWidth: 140 }}
            />
            <TextField
              size="small"
              label={t('sessions.dataKey')}
              value={draft.dataKey}
              onChange={(e) => setDraft((d) => ({ ...d, dataKey: e.target.value }))}
              sx={{ minWidth: 140 }}
            />
            <TextField
              size="small"
              label={t('sessions.dataValue')}
              value={draft.dataValue}
              onChange={(e) => setDraft((d) => ({ ...d, dataValue: e.target.value }))}
              sx={{ minWidth: 140 }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                setFilters(draft)
                setPage(0)
              }}
            >
              {t('common.apply')}
            </Button>
            <Button
              size="small"
              onClick={() => {
                setDraft(EMPTY_FILTERS)
                setFilters(EMPTY_FILTERS)
                setPage(0)
              }}
            >
              {t('sessions.reset')}
            </Button>
          </Stack>
        </Card>
      </Collapse>

      <Popover
        open={!!colAnchor}
        anchorEl={colAnchor}
        onClose={() => setColAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Box sx={{ width: 260, py: 1 }}>
          <Typography variant="subtitle2" sx={{ px: 2, pb: 1 }}>
            {t('sessions.columns')}
          </Typography>
          <List dense disablePadding>
            {order.map((key, i) => (
              <ListItem
                key={key}
                disablePadding
                secondaryAction={
                  <>
                    <IconButton size="small" disabled={i === 0} onClick={() => moveColumn(key, -1)}>
                      <KeyboardArrowUpIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={i === order.length - 1} onClick={() => moveColumn(key, 1)}>
                      <KeyboardArrowDownIcon fontSize="small" />
                    </IconButton>
                  </>
                }
              >
                <ListItemButton onClick={() => toggleColumn(key)} dense>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <span style={{ fontSize: 14 }}>✓</span>
                  </ListItemIcon>
                  <ListItemText primary={columnLabel[key]} />
                </ListItemButton>
              </ListItem>
            ))}
            {hiddenColumns.map((key) => (
              <ListItem key={key} disablePadding>
                <ListItemButton onClick={() => toggleColumn(key)} dense>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <span style={{ opacity: 0.3, fontSize: 14 }}>✓</span>
                  </ListItemIcon>
                  <ListItemText primary={columnLabel[key]} sx={{ opacity: 0.6 }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Popover>

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
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 40 }} />
                {order.map((key) => (
                  <TableCell key={key} sx={{ width: COLUMN_WIDTHS[key], px: 1.25, whiteSpace: 'nowrap' }}>
                    {columnLabel[key]}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {pageMessages.map((m) => (
                <Row key={`${m.session_id}-${m.seq}`} m={m} order={order} />
              ))}
              {pageMessages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={order.length + 1} align="center" sx={{ color: 'text.secondary', py: 4 }}>
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
          rowsPerPageOptions={[10, 20, 100, 1000]}
        />
      </Card>
    </Box>
  )
}

const Row = memo(function Row({ m, order }: { m: MessageEvent; order: ColumnKey[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        {order.map((key) => (
          <TableCell key={key} sx={{ px: 1.25 }}>
            {renderCell(key, m)}
          </TableCell>
        ))}
      </TableRow>
      <TableRow>
        <TableCell sx={{ py: 0 }} colSpan={order.length + 1}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, pl: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('sessions.detail')}
              </Typography>
              <JsonBlock
                value={{
                  time_nano: m.time_nano,
                  tag: m.tag,
                  message: m.message,
                  data: m.data,
                  seq: m.seq,
                  received_at: m.received_at,
                }}
              />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
})
