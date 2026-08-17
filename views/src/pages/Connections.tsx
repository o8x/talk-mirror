import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import EditIcon from '@mui/icons-material/Edit'
import ConfirmDialog from '../components/ConfirmDialog'
import StatCard from '../components/StatCard'
import TrendChart from '../components/TrendChart'
import {
  createSession,
  deleteConnection,
  deleteSession,
  exportSession,
  getConnections,
  getOverview,
  getSessions,
  updateSession,
} from '../api/client'
import { ws } from '../api/ws'
import { formatCount, formatTime } from '../utils'
import { useT } from '../i18n'
import { useStore } from '../store/store'
import type { Connection, Overview, Session } from '../types'

interface ConfirmState {
  title: string
  content: string
  onConfirm: () => void
}

export default function Connections() {
  const t = useT()
  const localIp = useStore((s) => s.localIp)
  const settings = useStore((s) => s.settings)
  const [connections, setConnections] = useState<Connection[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [detail, setDetail] = useState<Connection | null>(null)
  const [detailSessions, setDetailSessions] = useState<Session[]>([])
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null)
  const [exportTarget, setExportTarget] = useState<Session | null>(null)
  const [copiedId, setCopiedId] = useState('')
  const [editTarget, setEditTarget] = useState<Session | null>(null)
  const [editName, setEditName] = useState('')
  const [editPort, setEditPort] = useState('')

  // Connection overview chart uses half the configured trend point count.
  const trendPoints = useMemo(() => {
    const n = parseInt(settings.trend_points ?? '', 10)
    const configured = Number.isFinite(n) && n > 0 ? n : 300
    return Math.max(1, Math.floor(configured / 2))
  }, [settings.trend_points])

  const refresh = useCallback(async () => {
    try {
      const [cs, ov] = await Promise.all([getConnections(), getOverview({ seconds: 300, points: trendPoints })])
      setConnections(cs)
      setOverview(ov)
    } catch {
      /* ignore */
    }
  }, [trendPoints])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 3000)
    const off = ws.on((ev) => {
      if (ev.type === 'connection' || ev.type === 'session') refresh()
    })
    return () => {
      clearInterval(timer)
      off()
    }
  }, [refresh])

  const openDetail = useCallback(async (c: Connection) => {
    setDetail(c)
    setDetailSessions([])
    try {
      const ss = await getSessions(c.id)
      setDetailSessions(ss)
    } catch {
      /* ignore */
    }
  }, [])

  const handleDeleteConnection = useCallback(
    (c: Connection) => {
      setConfirm({
        title: t('connections.delete'),
        content: t('connections.deleteConnectionConfirm'),
        onConfirm: async () => {
          try {
            await deleteConnection(c.id)
            setDetail(null)
            refresh()
          } catch {
            /* ignore */
          }
          setConfirm(null)
        },
      })
    },
    [refresh, t],
  )

  const handleDeleteSession = useCallback(
    (s: Session) => {
      setConfirm({
        title: t('connections.delete'),
        content: t('connections.deleteSessionConfirm'),
        onConfirm: async () => {
          try {
            await deleteSession(s.id)
            setDetailSessions((prev) => prev.filter((x) => x.id !== s.id))
            refresh()
          } catch {
            /* ignore */
          }
          setConfirm(null)
        },
      })
    },
    [refresh, t],
  )

  const doExport = useCallback(
    async (format: 'json' | 'csv') => {
      const s = exportTarget
      setExportAnchor(null)
      if (!s) return
      try {
        await exportSession(s.id, format)
      } catch {
        /* ignore */
      }
    },
    [exportTarget],
  )

  const copySessionId = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
    } catch {
      /* ignore */
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId(''), 1500)
  }, [])

  const handleNewSession = useCallback(async () => {
    if (!detail) return
    try {
      const s = await createSession(detail.id)
      setDetailSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)])
      refresh()
    } catch {
      /* ignore */
    }
  }, [detail, refresh])

  const openEdit = useCallback((s: Session) => {
    setEditTarget(s)
    setEditName(s.name ?? '')
    setEditPort(String(s.port))
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editTarget) return
    const port = parseInt(editPort, 10)
    try {
      await updateSession(editTarget.id, {
        name: editName,
        port: Number.isFinite(port) && port > 0 && port <= 65535 ? port : editTarget.port,
      })
      setDetailSessions((prev) =>
        prev.map((x) =>
          x.id === editTarget.id ? { ...x, name: editName, port: port || x.port } : x,
        ),
      )
      refresh()
    } catch {
      /* ignore */
    }
    setEditTarget(null)
  }, [editTarget, editName, editPort, refresh])

  const activeSessions = useMemo(
    () => connections.reduce((n, c) => n + c.active_sessions, 0),
    [connections],
  )

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {t('connections.globalActivity')}
            </Typography>
            <TrendChart data={overview?.buckets ?? []} height={180} />
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Grid container spacing={1.5}>
            <Grid item xs={6}>
              <StatCard label={t('connections.connections')} value={String(connections.length)} />
            </Grid>
            <Grid item xs={6}>
              <StatCard label={t('home.activeSessions')} value={String(activeSessions)} />
            </Grid>
            <Grid item xs={6}>
              <StatCard label={t('home.totalMessages')} value={formatCount(overview?.total_messages ?? 0)} />
            </Grid>
            <Grid item xs={6}>
              <StatCard label={t('home.messagesPerSec')} value={(overview?.qps ?? 0).toFixed(0)} />
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>IP</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('connections.messages')}</TableCell>
                <TableCell>{t('connections.sessions')}</TableCell>
                <TableCell>{t('common.active')}</TableCell>
                <TableCell>{t('connections.lastSeen')}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {connections.map((c) => (
                <TableRow
                  key={c.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => openDetail(c)}
                >
                  <TableCell sx={{ fontFamily: 'monospace' }}>
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
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={c.status === 'active' ? t('common.active') : t('common.closed')}
                      size="small"
                      color={c.status === 'active' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{formatCount(c.message_count)}</TableCell>
                  <TableCell>{c.session_count}</TableCell>
                  <TableCell>{c.active_sessions}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{formatTime(c.last_seen)}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      title={t('connections.delete')}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteConnection(c)
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {connections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    {t('connections.noConnections')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Drawer
        anchor="right"
        open={!!detail}
        onClose={() => setDetail(null)}
        sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: 1000 } } }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="h6">{detail ? t('connections.dialogTitle', { ip: detail.ip }) : ''}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button size="small" startIcon={<AddIcon />} onClick={handleNewSession}>
                {t('connections.newSession')}
              </Button>
              <IconButton onClick={() => setDetail(null)}>
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {t('connections.firstSeen')} {detail ? formatTime(detail.first_seen) : ''} ·{' '}
            {t('connections.lastSeen')} {detail ? formatTime(detail.last_seen) : ''} ·{' '}
            {detail?.message_count ?? 0} {t('connections.messages')}
          </Typography>
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('connections.name')}</TableCell>
                <TableCell>{t('sessions.port')}</TableCell>
                <TableCell>{t('connections.protocol')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('connections.messages')}</TableCell>
                <TableCell>{t('connections.lastActive')}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {detailSessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{s.port}</TableCell>
                  <TableCell>{s.protocol}</TableCell>
                  <TableCell>
                    <Chip
                      label={s.status === 'active' ? t('common.active') : t('common.closed')}
                      size="small"
                      color={s.status === 'active' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{formatCount(s.message_count)}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{formatTime(s.last_active_at)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton
                      size="small"
                      title={t('connections.editSession')}
                      onClick={() => openEdit(s)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      title={t('connections.copySessionId')}
                      onClick={() => copySessionId(s.id)}
                    >
                      {copiedId === s.id ? (
                        <CheckIcon fontSize="small" color="success" />
                      ) : (
                        <ContentCopyIcon fontSize="small" />
                      )}
                    </IconButton>
                    <IconButton
                      size="small"
                      title={t('connections.export')}
                      onClick={(e) => {
                        setExportAnchor(e.currentTarget)
                        setExportTarget(s)
                      }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      title={t('connections.delete')}
                      onClick={() => handleDeleteSession(s)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {detailSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>
                    {t('connections.noSessions')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Drawer>

      <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
        <MenuItem onClick={() => doExport('json')}>{t('connections.exportJson')}</MenuItem>
        <MenuItem onClick={() => doExport('csv')}>{t('connections.exportCsv')}</MenuItem>
      </Menu>

      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('connections.editSession')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label={t('connections.name')}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            size="small"
            type="number"
            label={t('sessions.port')}
            value={editPort}
            onChange={(e) => setEditPort(e.target.value)}
            inputProps={{ min: 1, max: 65535 }}
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={saveEdit}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        content={confirm?.content ?? ''}
        confirmText={t('connections.delete')}
        cancelText={t('common.cancel')}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />
    </Box>
  )
}
