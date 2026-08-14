export function formatTime(ns: number): string {
  const d = new Date(Math.floor(ns / 1e6))
  return d.toLocaleString()
}

export function formatCount(n: number): string {
  if (n >= 1e9) return trimZeros((n / 1e9).toFixed(2)) + 'B'
  if (n >= 1e6) return trimZeros((n / 1e6).toFixed(2)) + 'M'
  return n.toLocaleString()
}

function trimZeros(s: string): string {
  return s.replace(/\.?0+$/, '')
}

export function formatQps(n: number): string {
  return n.toFixed(0)
}

export function nowNano(): number {
  return Date.now() * 1e6
}
