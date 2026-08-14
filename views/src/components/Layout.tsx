import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Alert,
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ListAltIcon from '@mui/icons-material/ListAlt'
import LanIcon from '@mui/icons-material/Lan'
import CodeIcon from '@mui/icons-material/Code'
import SettingsIcon from '@mui/icons-material/Settings'
import ScienceIcon from '@mui/icons-material/Science'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import PauseCircleIcon from '@mui/icons-material/PauseCircle'
import PlayCircleIcon from '@mui/icons-material/PlayCircle'
import TranslateIcon from '@mui/icons-material/Translate'
import GitHubIcon from '@mui/icons-material/GitHub'
import { useStore } from '../store/store'
import { setPause, saveSettings } from '../api/client'
import { LANGS, useLang, useT } from '../i18n'
import logoUrl from '../assets/logo.svg'

const DRAWER_WIDTH = 220

export default function Layout() {
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const t = useT()
  const { lang, setLang } = useLang()
  const darkMode = useStore((s) => s.darkMode)
  const toggleDark = useStore((s) => s.toggleDark)
  const paused = useStore((s) => s.paused)
  const setPaused = useStore((s) => s.setPaused)
  const wsConnected = useStore((s) => s.wsConnected)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const items = [
    { path: '/', label: t('menu.home'), icon: <DashboardIcon /> },
    { path: '/sessions', label: t('menu.sessions'), icon: <ListAltIcon /> },
    { path: '/connections', label: t('menu.connections'), icon: <LanIcon /> },
    { path: '/access', label: t('menu.access'), icon: <CodeIcon /> },
    { path: '/test', label: t('menu.test'), icon: <ScienceIcon /> },
    { path: '/settings', label: t('menu.settings'), icon: <SettingsIcon /> },
  ]

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box component="img" src={logoUrl} sx={{ width: 36, height: 36 }} alt="logo" />
        <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: 0.5 }}>
          TALK MIRROR
        </Typography>
      </Box>
      <List sx={{ px: 1 }}>
        {items.map((it) => {
          const selected =
            it.path === '/' ? location.pathname === '/' : location.pathname.startsWith(it.path)
          return (
            <ListItemButton
              key={it.path}
              selected={selected}
              onClick={() => {
                navigate(it.path)
                setMobileOpen(false)
              }}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{it.icon}</ListItemIcon>
              <ListItemText primary={it.label} />
            </ListItemButton>
          )
        })}
      </List>
      <Box sx={{ mt: 'auto', p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          ws: {wsConnected ? t('common.ws.connected') : t('common.ws.offline')}
        </Typography>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {items.find((i) =>
              i.path === '/' ? location.pathname === '/' : location.pathname.startsWith(i.path),
            )?.label ?? ''}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              onClick={() => window.open('https://github.com/o8x/talk-mirror', '_blank', 'noopener')}
              title="GitHub"
            >
              <GitHubIcon />
            </IconButton>
            <Tooltip title={paused ? t('common.resume') : t('common.pause')}>
              <IconButton
                onClick={() => {
                  const next = !paused
                  setPaused(next)
                  setPause(next)
                }}
              >
                {paused ? <PauseCircleIcon color="error" /> : <PlayCircleIcon />}
              </IconButton>
            </Tooltip>
            <IconButton
              onClick={() => {
                toggleDark()
                saveSettings({ dark_mode: String(!darkMode) }).catch(() => {})
              }}
            >
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TranslateIcon fontSize="small" color="action" />
              <Select
                size="small"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                variant="standard"
                disableUnderline
                sx={{ fontSize: 14, '& .MuiSelect-select': { py: 0.5 } }}
              >
                {LANGS.map((l) => (
                  <MenuItem key={l.value} value={l.value}>
                    {l.label}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRight: '1px solid', borderColor: 'divider' },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{ flexGrow: 1, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, p: 3, pt: 10 }}
      >
        {paused && (
          <Alert severity="error" icon={<PauseCircleIcon />} sx={{ mb: 2 }}>
            {t('pause.banner')}
          </Alert>
        )}
        <Outlet />
      </Box>
    </Box>
  )
}
