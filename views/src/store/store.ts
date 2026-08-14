import { create } from 'zustand'

const DEFAULT_GREEN = '#2e7d32'
const DEFAULT_RED = '#c62828'

const LANG_KEY = 'talk-mirror-lang'
const KEY_KEY = 'talk-mirror-key'
const LOCAL_IP_KEY = 'talk-mirror-local-ip'

interface Settings {
  [key: string]: string
}

interface AppState {
  darkMode: boolean
  themeColor: string
  paused: boolean
  wsConnected: boolean
  lang: string
  key: string
  localIp: string
  settings: Settings
  setDarkMode: (v: boolean) => void
  toggleDark: () => void
  setThemeColor: (v: string) => void
  setPaused: (v: boolean) => void
  setWsConnected: (v: boolean) => void
  setLang: (v: string) => void
  setKey: (v: string) => void
  clearKey: () => void
  setLocalIp: (v: string) => void
  setSettings: (s: Settings) => void
}

export const useStore = create<AppState>((set) => ({
  darkMode: false,
  themeColor: DEFAULT_RED,
  paused: false,
  wsConnected: false,
  lang: localStorage.getItem(LANG_KEY) ?? 'en',
  key: localStorage.getItem(KEY_KEY) ?? '',
  localIp: localStorage.getItem(LOCAL_IP_KEY) ?? '',
  settings: {},
  setDarkMode: (v) => set({ darkMode: v }),
  toggleDark: () =>
    set((s) => {
      const next = !s.darkMode
      let color = s.themeColor
      if (color === DEFAULT_GREEN && !next) color = DEFAULT_RED
      else if (color === DEFAULT_RED && next) color = DEFAULT_GREEN
      return { darkMode: next, themeColor: color }
    }),
  setThemeColor: (v) => set({ themeColor: v }),
  setPaused: (v) => set({ paused: v }),
  setWsConnected: (v) => set({ wsConnected: v }),
  setLang: (v) => {
    localStorage.setItem(LANG_KEY, v)
    set({ lang: v })
  },
  setKey: (v) => {
    localStorage.setItem(KEY_KEY, v)
    set({ key: v })
  },
  clearKey: () => {
    localStorage.removeItem(KEY_KEY)
    set({ key: '' })
  },
  setLocalIp: (v) => {
    localStorage.setItem(LOCAL_IP_KEY, v)
    set({ localIp: v })
  },
  setSettings: (s) => set({ settings: s }),
}))
