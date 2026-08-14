import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Card,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import StatCard from '../components/StatCard'
import TrendChart from '../components/TrendChart'
import { getConnections, getOverview, getSessions } from '../api/client'
import { ws } from '../api/ws'
import { formatCount, formatTime } from '../utils'
import { useT } from '../i18n'
import type { Connection, Overview, Session } from '../types'

export default function Connections() {
  const t = useT()
  const [connections, setConnections] = useState<Connection[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [detail, setDetail] = useState<Connection | null>(null)
  const [detailSessions, setDetailSessions] = useState<Session[]>([])

  const refresh = useCallback(async () => {
    try {
      const [cs, ov] = await Promise.all([getConnections(), getOverview({ seconds: 300 })])
      setConnections(cs)
      setOverview(ov)
    } catch {
      /* ignore */
    }
  }, [])

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
                  <TableCell sx={{ fontFamily: 'monospace' }}>{c.ip}</TableCell>
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
                </TableRow>
              ))}
              {connections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    {t('connections.noConnections')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {detail ? t('connections.dialogTitle', { ip: detail.ip }) : ''}
          <IconButton onClick={() => setDetail(null)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {t('connections.firstSeen')} {detail ? formatTime(detail.first_seen) : ''} ·{' '}
            {t('connections.lastSeen')} {detail ? formatTime(detail.last_seen) : ''} ·{' '}
            {detail?.message_count ?? 0} {t('connections.messages')}
          </Typography>
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('sessions.port')}</TableCell>
                <TableCell>{t('connections.protocol')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('connections.messages')}</TableCell>
                <TableCell>{t('connections.lastActive')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detailSessions.map((s) => (
                <TableRow key={s.id}>
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
                </TableRow>
              ))}
              {detailSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                    {t('connections.noSessions')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
