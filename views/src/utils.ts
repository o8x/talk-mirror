export function formatTime(ns: number): string {
  const d = new Date(Math.floor(ns / 1e6))
  return d.toLocaleString()
}

export function formatCount(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}

export function formatQps(n: number): string {
  return n.toFixed(0)
}

export function nowNano(): number {
  return Date.now() * 1e6
}
