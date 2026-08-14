import { create } from 'zustand'

const DEFAULT_GREEN = '#2e7d32'
const DEFAULT_RED = '#c62828'

interface Settings {
  [key: string]: string
}

interface AppState {
  darkMode: boolean
  themeColor: string
  paused: boolean
  wsConnected: boolean
  settings: Settings
  setDarkMode: (v: boolean) => void
  toggleDark: () => void
  setThemeColor: (v: string) => void
  setPaused: (v: boolean) => void
  setWsConnected: (v: boolean) => void
  setSettings: (s: Settings) => void
}

export const useStore = create<AppState>((set) => ({
  darkMode: true,
  themeColor: DEFAULT_GREEN,
  paused: false,
  wsConnected: false,
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
  setSettings: (s) => set({ settings: s }),
}))
