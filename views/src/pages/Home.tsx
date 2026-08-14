import { useCallback, useEffect, useState } from 'react'
import { Box, Card, Chip, Grid, Stack, TextField, Typography } from '@mui/material'
import StatCard from '../components/StatCard'
import TrendChart from '../components/TrendChart'
import { getOverview, getSessions } from '../api/client'
import { formatCount, formatQps, formatTime } from '../utils'
import { useT } from '../i18n'
import type { Overview, Session } from '../types'

const ranges = [
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
  { label: '6h', seconds: 21600 },
  { label: '24h', seconds: 86400 },
]

function dtToNs(v: string): number {
  return new Date(v).getTime() * 1e6
}

function nsToDt(ns: number): string {
  const d = new Date(Math.floor(ns / 1e6))
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Home() {
  const t = useT()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [rangeSeconds, setRangeSeconds] = useState(300)
  const [custom, setCustom] = useState<{ start: number; end: number } | null>(null)
  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')

  const load = useCallback(async () => {
    try {
      const opts = custom ? { start: custom.start, end: custom.end } : { seconds: rangeSeconds }
      const [ov, ss] = await Promise.all([getOverview(opts), getSessions()])
      setOverview(ov)
      setSessions(ss.filter((s) => s.status === 'active').slice(0, 8))
    } catch {
      /* ignore */
    }
  }, [rangeSeconds, custom])

  useEffect(() => {
    let alive = true
    const run = () => load()
    run()
    const timer = setInterval(run, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [load])

  const handleBrush = useCallback((startNs: number, endNs: number) => {
    setCustom({ start: startNs, end: endNs })
    setStartInput(nsToDt(startNs))
    setEndInput(nsToDt(endNs))
  }, [])

  const applyCustom = () => {
    if (!startInput || !endInput) return
    const start = dtToNs(startInput)
    const end = dtToNs(endInput)
    if (start >= end) return
    setCustom({ start, end })
  }

  const clearCustom = () => {
    setCustom(null)
    setStartInput('')
    setEndInput('')
  }

  return (
    <Box>
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatCard label={t('home.totalMessages')} value={formatCount(overview?.total_messages ?? 0)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label={t('home.messagesPerSec')} value={formatQps(overview?.qps ?? 0)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label={t('home.activeConnections')} value={String(overview?.active_connections ?? 0)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label={t('home.activeSessions')} value={String(overview?.active_sessions ?? 0)} />
        </Grid>
      </Grid>

      <Card sx={{ mt: 2, p: 2 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}
        >
          {ranges.map((r) => (
            <Chip
              key={r.label}
              label={r.label}
              size="small"
              color={!custom && rangeSeconds === r.seconds ? 'primary' : 'default'}
              variant={!custom && rangeSeconds === r.seconds ? 'filled' : 'outlined'}
              onClick={() => {
                setCustom(null)
                setRangeSeconds(r.seconds)
              }}
            />
          ))}
          <TextField
            size="small"
            type="datetime-local"
            label={t('common.start')}
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 200 }}
          />
          <TextField
            size="small"
            type="datetime-local"
            label={t('common.end')}
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 200 }}
          />
          <Chip label={t('common.apply')} size="small" color="primary" onClick={applyCustom} />
          {custom && <Chip label="×" size="small" onClick={clearCustom} />}
        </Stack>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t('home.trendTitle')} · {t('sessions.brushHint')}
        </Typography>
        <TrendChart data={overview?.buckets ?? []} height={260} brushable onBrush={handleBrush} />
      </Card>

      <Card sx={{ mt: 2, p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t('home.recentSessions')}
        </Typography>
        {sessions.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('home.noSessions')}
          </Typography>
        )}
        {sessions.map((s) => (
          <Box
            key={s.id}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {s.ip}:{s.port} <span style={{ opacity: 0.6 }}>/{s.protocol}</span>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatCount(s.message_count)} {t('home.msgs')} · {formatTime(s.last_active_at)}
            </Typography>
          </Box>
        ))}
      </Card>
    </Box>
  )
}
