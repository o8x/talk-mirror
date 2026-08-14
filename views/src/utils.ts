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

// tagColor returns a stable color derived from the tag text hash, so the same
// tag always renders with the same color.
export function tagColor(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hue = ((h >>> 0) % 360 + 360) % 360
  return `hsl(${hue}, 60%, 42%)`
}
