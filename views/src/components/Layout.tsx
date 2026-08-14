import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
  Alert,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ListAltIcon from '@mui/icons-material/ListAlt'
import LanIcon from '@mui/icons-material/Lan'
import CodeIcon from '@mui/icons-material/Code'
import SettingsIcon from '@mui/icons-material/Settings'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import PauseCircleIcon from '@mui/icons-material/PauseCircle'
import PlayCircleIcon from '@mui/icons-material/PlayCircle'
import { useStore } from '../store/store'
import { setPause } from '../api/client'
import logoUrl from '../assets/logo.svg'

const DRAWER_WIDTH = 220

const items = [
  { path: '/', label: 'Home', icon: <DashboardIcon /> },
  { path: '/sessions', label: 'Sessions', icon: <ListAltIcon /> },
  { path: '/connections', label: 'Connections', icon: <LanIcon /> },
  { path: '/access', label: 'Access', icon: <CodeIcon /> },
  { path: '/settings', label: 'Settings', icon: <SettingsIcon /> },
]

export default function Layout() {
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const darkMode = useStore((s) => s.darkMode)
  const toggleDark = useStore((s) => s.toggleDark)
  const paused = useStore((s) => s.paused)
  const setPaused = useStore((s) => s.setPaused)
  const wsConnected = useStore((s) => s.wsConnected)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box component="img" src={logoUrl} sx={{ width: 36, height: 36 }} alt="logo" />
        <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: 0.5 }}>
          Talk-mirror
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
              sx={{ borderRadius: 2, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{it.icon}</ListItemIcon>
              <ListItemText primary={it.label} />
            </ListItemButton>
          )
        })}
      </List>
      <Box sx={{ mt: 'auto', p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          ws: {wsConnected ? 'connected' : 'offline'}
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
            <Tooltip title={paused ? 'Resume' : 'Pause system'}>
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
            <IconButton onClick={toggleDark}>
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
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
            The system is paused and not receiving any data.
          </Alert>
        )}
        <Outlet />
      </Box>
    </Box>
  )
}
