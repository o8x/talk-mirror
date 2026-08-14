import { useEffect, useState } from 'react'
import { Box, Card, Grid, Typography } from '@mui/material'
import StatCard from '../components/StatCard'
import TrendChart from '../components/TrendChart'
import { getOverview, getSessions } from '../api/client'
import { formatCount, formatQps, formatTime } from '../utils'
import type { Overview, Session } from '../types'

export default function Home() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [ov, ss] = await Promise.all([getOverview(300), getSessions()])
        if (!alive) return
        setOverview(ov)
        setSessions(ss.filter((s) => s.status === 'active').slice(0, 8))
      } catch {
        /* ignore */
      }
    }
    load()
    const t = setInterval(load, 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return (
    <Box>
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatCard label="Total messages" value={formatCount(overview?.total_messages ?? 0)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Messages / sec" value={formatQps(overview?.qps ?? 0)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Active connections" value={String(overview?.active_connections ?? 0)} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Active sessions" value={String(overview?.active_sessions ?? 0)} />
        </Grid>
      </Grid>

      <Card sx={{ mt: 2, p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Messages over the last 5 minutes
        </Typography>
        <TrendChart data={overview?.buckets ?? []} height={260} />
      </Card>

      <Card sx={{ mt: 2, p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Recent active sessions
        </Typography>
        {sessions.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No active sessions yet.
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
              {formatCount(s.message_count)} msgs · {formatTime(s.last_active_at)}
            </Typography>
          </Box>
        ))}
      </Card>
    </Box>
  )
}
