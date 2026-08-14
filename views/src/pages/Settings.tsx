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
import { useT } from '../i18n'

interface FormState {
  web_host: string
  web_port: string
  data_host: string
  data_port: string
  tls_cert: string
  tls_key: string
  theme_color: string
  auth_key: string
}

export default function Settings() {
  const t = useT()
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
    theme_color: '#c62828',
    auth_key: '',
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
          theme_color: s.theme_color ?? '#c62828',
          auth_key: s.auth_key ?? '',
        })
        setReadonly({ leveldb_dir: s.leveldb_dir ?? '', sqlite_file: s.sqlite_file ?? '' })
      })
      .catch(() => {})
  }, [])

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const shrink = { shrink: true }

  const onSave = async () => {
    const body: Record<string, string> = { ...form, dark_mode: String(darkMode) }
    try {
      await saveSettings(body)
      if (body.theme_color) setThemeColor(body.theme_color)
      setSaved(true)
    } catch {
      /* ignore */
    }
  }

  return (
    <Box sx={{ maxWidth: 680 }}>
      <Card sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {t('settings.network')}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={8}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.webAddress')}
              value={form.web_host}
              onChange={set('web_host')}
              InputLabelProps={shrink}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.webPort')}
              value={form.web_port}
              onChange={set('web_port')}
              InputLabelProps={shrink}
            />
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.dataAddress')}
              value={form.data_host}
              onChange={set('data_host')}
              InputLabelProps={shrink}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.dataPort')}
              value={form.data_port}
              onChange={set('data_port')}
              InputLabelProps={shrink}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {t('settings.tls')}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.certPath')}
              value={form.tls_cert}
              onChange={set('tls_cert')}
              placeholder="auto-generated if empty"
              InputLabelProps={shrink}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.keyPath')}
              value={form.tls_key}
              onChange={set('tls_key')}
              placeholder="auto-generated if empty"
              InputLabelProps={shrink}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {t('settings.security')}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.authKey')}
              value={form.auth_key}
              onChange={set('auth_key')}
              InputLabelProps={shrink}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {t('settings.appearance')}
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('settings.themeColor')}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                component="input"
                type="color"
                value={form.theme_color}
                onChange={(e) => {
                  setForm((f) => ({ ...f, theme_color: e.target.value }))
                  setThemeColor(e.target.value)
                }}
                sx={{
                  width: 44,
                  height: 36,
                  p: 0,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {form.theme_color}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={darkMode}
                  onChange={() => {
                    toggleDark()
                    saveSettings({ dark_mode: String(!darkMode) }).catch(() => {})
                  }}
                />
              }
              label={t('settings.darkMode')}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {t('settings.storage')}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.sqliteFile')}
              value={readonly.sqlite_file}
              InputProps={{ readOnly: true }}
              InputLabelProps={shrink}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              label={t('settings.leveldbDir')}
              value={readonly.leveldb_dir}
              InputProps={{ readOnly: true }}
              InputLabelProps={shrink}
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="contained" onClick={onSave}>
            {t('common.save')}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t('settings.restartNote')}
          </Typography>
        </Box>
      </Card>

      <Snackbar
        open={saved}
        autoHideDuration={2000}
        onClose={() => setSaved(false)}
        message={t('settings.saved')}
      />
    </Box>
  )
}
