import { lazy, Suspense, useEffect, useMemo } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { buildTheme } from './theme/theme'
import { useStore } from './store/store'
import { ws } from './api/ws'
import { getSettings, getVersion } from './api/client'
import Layout from './components/Layout'
import Home from './pages/Home'
import Sessions from './pages/Sessions'
import Connections from './pages/Connections'
import Test from './pages/Test'
import Settings from './pages/Settings'
import Login from './pages/Login'

const Access = lazy(() => import('./pages/Access'))

export default function App() {
  const darkMode = useStore((s) => s.darkMode)
  const themeColor = useStore((s) => s.themeColor)
  const key = useStore((s) => s.key)
  const setSettings = useStore((s) => s.setSettings)
  const setDarkMode = useStore((s) => s.setDarkMode)
  const setThemeColor = useStore((s) => s.setThemeColor)
  const setPaused = useStore((s) => s.setPaused)
  const setVersion = useStore((s) => s.setVersion)

  useEffect(() => {
    if (!key) return
    getVersion()
      .then((r) => setVersion(r.version))
      .catch(() => {})
    getSettings()
      .then((s) => {
        setSettings(s)
        if (s.dark_mode !== undefined) setDarkMode(s.dark_mode !== 'false')
        if (s.theme_color) setThemeColor(s.theme_color)
        if (s.paused === 'true') setPaused(true)
      })
      .catch(() => {})
    ws.connect()
  }, [key, setSettings, setDarkMode, setThemeColor, setPaused])

  const theme = useMemo(() => buildTheme(darkMode, themeColor), [darkMode, themeColor])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {key ? (
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="connections" element={<Connections />} />
              <Route path="access" element={
                  <Suspense fallback={null}>
                    <Access />
                  </Suspense>
                }
              />
              <Route path="test" element={<Test />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      ) : (
        <Login />
      )}
    </ThemeProvider>
  )
}
