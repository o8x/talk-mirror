import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  Grid,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import SendIcon from '@mui/icons-material/Send'
import { sendTestMessage } from '../api/client'
import { useT } from '../i18n'

interface Field {
  key: string
  value: string
}

interface Result {
  ok: boolean
  ms: number
  error?: string
}

export default function Test() {
  const t = useT()
  const [address, setAddress] = useState(() => window.location.hostname || '127.0.0.1')
  const [apiPort, setApiPort] = useState(() => window.location.port || '443')
  const [talkPort, setTalkPort] = useState('3000')
  const [message, setMessage] = useState('')
  const [fields, setFields] = useState<Field[]>([{ key: '', value: '' }])
  const [result, setResult] = useState<Result | null>(null)
  const [running, setRunning] = useState(false)

  const setField = (i: number, k: 'key' | 'value', v: string) => {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, [k]: v } : f)))
  }

  const addField = () => setFields((prev) => [...prev, { key: '', value: '' }])
  const removeField = (i: number) =>
    setFields((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))

  const run = async () => {
    setRunning(true)
    setResult(null)
    const data: Record<string, string> = {}
    for (const f of fields) {
      if (f.key.trim()) data[f.key.trim()] = f.value
    }
    const baseUrl = `https://${address.trim()}:${apiPort.trim()}`
    const started = performance.now()
    try {
      await sendTestMessage(baseUrl, { message, data })
      setResult({ ok: true, ms: Math.round(performance.now() - started) })
    } catch (e) {
      setResult({ ok: false, ms: Math.round(performance.now() - started), error: String(e) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Card sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('test.hint')}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={8}>
            <TextField
              fullWidth
              size="small"
              label={t('test.server')}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              label={t('test.apiPort')}
              value={apiPort}
              onChange={(e) => setApiPort(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              fullWidth
              size="small"
              label={t('test.talkPort')}
              value={talkPort}
              onChange={(e) => setTalkPort(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              label={t('test.message')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              multiline
              minRows={2}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {t('test.data')}
            </Typography>
            <Stack spacing={1}>
              {fields.map((f, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    label={t('test.key')}
                    value={f.key}
                    onChange={(e) => setField(i, 'key', e.target.value)}
                    sx={{ width: 200 }}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label={t('test.value')}
                    value={f.value}
                    onChange={(e) => setField(i, 'value', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <IconButton size="small" onClick={() => removeField(i)}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
            <Button size="small" startIcon={<AddIcon />} onClick={addField} sx={{ mt: 1 }}>
              {t('test.addField')}
            </Button>
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="contained" startIcon={<SendIcon />} onClick={run} disabled={running}>
            {t('test.run')}
          </Button>
          {result && (
            <Alert severity={result.ok ? 'success' : 'error'} sx={{ flex: 1 }}>
              {result.ok
                ? `${t('test.success')} · ${t('test.duration')}: ${result.ms} ms`
                : `${t('test.failed')}: ${result.error}`}
            </Alert>
          )}
        </Box>
      </Card>
    </Box>
  )
}
