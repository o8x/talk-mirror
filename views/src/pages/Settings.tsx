import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Divider,
  FormControlLabel,
  Grid,
  Snackbar,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { getSettings, saveSettings } from '../api/client'
import { useStore } from '../store/store'

interface FormState {
  web_host: string
  web_port: string
  data_host: string
  data_port: string
  tls_cert: string
  tls_key: string
  theme_color: string
}

export default function Settings() {
  const darkMode = useStore((s) => s.darkMode)
  const toggleDark = useStore((s) => s.toggleDark)
  const setThemeColor = useStore((s) => s.setThemeColor)
  const [form, setForm] = useState<FormState>({
    web_host: '0.0.0.0',
    web_port: '443',
    data_host: '0.0.0.0',
    data_port: '3000',
    tls_cert: '',
    tls_key: '',
    theme_color: '#2e7d32',
  })
  const [readonly, setReadonly] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSettings()
      .then((s) => {
        setForm({
          web_host: s.web_host ?? '0.0.0.0',
          web_port: s.web_port ?? '443',
          data_host: s.data_host ?? '0.0.0.0',
          data_port: s.data_port ?? '3000',
          tls_cert: s.tls_cert ?? '',
          tls_key: s.tls_key ?? '',
          theme_color: s.theme_color ?? '#2e7d32',
        })
        setReadonly({ leveldb_dir: s.leveldb_dir ?? '', sqlite_file: s.sqlite_file ?? '' })
      })
      .catch(() => {})
  }, [])

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const onSave = async () => {
    const body: Record<string, string> = { ...form }
    try {
      await saveSettings(body)
      if (body.theme_color) setThemeColor(body.theme_color)
      setSaved(true)
    } catch {
      /* ignore */
    }
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Card sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Network
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={8}>
            <TextField fullWidth label="Web address" size="small" value={form.web_host} onChange={set('web_host')} />
          </Grid>
          <Grid item xs={4}>
            <TextField fullWidth label="Web port" size="small" value={form.web_port} onChange={set('web_port')} />
          </Grid>
          <Grid item xs={8}>
            <TextField fullWidth label="Data address" size="small" value={form.data_host} onChange={set('data_host')} />
          </Grid>
          <Grid item xs={4}>
            <TextField fullWidth label="Data port" size="small" value={form.data_port} onChange={set('data_port')} />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          TLS certificate
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField fullWidth label="Certificate path" size="small" value={form.tls_cert} onChange={set('tls_cert')} placeholder="auto-generated if empty" />
          </Grid>
          <Grid item xs={6}>
            <TextField fullWidth label="Key path" size="small" value={form.tls_key} onChange={set('tls_key')} placeholder="auto-generated if empty" />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Appearance
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6}>
            <Typography variant="body2">Theme color</Typography>
            <input
              type="color"
              value={form.theme_color}
              onChange={(e) => {
                setForm((f) => ({ ...f, theme_color: e.target.value }))
                setThemeColor(e.target.value)
              }}
              style={{ width: 64, height: 40, border: 'none', background: 'transparent', cursor: 'pointer' }}
            />
          </Grid>
          <Grid item xs={6}>
            <FormControlLabel
              control={<Switch checked={darkMode} onChange={() => toggleDark()} />}
              label="Dark mode"
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Storage (read-only)
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField fullWidth label="SQLite file" size="small" value={readonly.sqlite_file} InputProps={{ readOnly: true }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="LevelDB directory" size="small" value={readonly.leveldb_dir} InputProps={{ readOnly: true }} />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="contained" onClick={onSave}>
            Save
          </Button>
          <Typography variant="caption" color="text.secondary">
            Port, address and TLS changes require a restart.
          </Typography>
        </Box>
      </Card>

      <Snackbar open={saved} autoHideDuration={2000} onClose={() => setSaved(false)} message="Settings saved" />
    </Box>
  )
}
