import { useState } from 'react'
import { Box, Button, Card, TextField, Typography } from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import { login } from '../api/client'
import { useStore } from '../store/store'
import logoUrl from '../assets/logo.svg'

export default function Login() {
  const setKey = useStore((s) => s.setKey)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    setError(false)
    try {
      await login(value.trim())
      setKey(value.trim())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Card sx={{ p: 4, width: '100%', maxWidth: 380 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box component="img" src={logoUrl} sx={{ width: 64, height: 64 }} alt="logo" />
          <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>
            TALK MIRROR
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter your access key
          </Typography>
        </Box>
        <TextField
          fullWidth
          type="password"
          label="Access key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          error={error}
          helperText={error ? 'Invalid key' : ''}
          InputLabelProps={{ shrink: true }}
        />
        <Button
          fullWidth
          variant="contained"
          startIcon={<LockIcon />}
          onClick={submit}
          disabled={loading || !value.trim()}
          sx={{ mt: 2 }}
        >
          Login
        </Button>
      </Card>
    </Box>
  )
}
