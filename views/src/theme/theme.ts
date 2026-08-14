import { createTheme, type Theme } from '@mui/material/styles'

export const DEFAULT_GREEN = '#2e7d32'
export const DEFAULT_RED = '#c62828'

export function buildTheme(dark: boolean, primary: string): Theme {
  return createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: primary },
      background: {
        default: dark ? '#0d1311' : '#f7f6f4',
        paper: dark ? '#141b18' : '#ffffff',
      },
      divider: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
          },
        },
      },
    },
  })
}
