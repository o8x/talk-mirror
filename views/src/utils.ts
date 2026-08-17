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

// 18 well-separated hues (20 deg apart) so any two tags have a large hue gap.
const TAG_HUES = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340]

function fnv1a(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// MurmurHash3-style avalanche finalizer: a one-bit input difference spreads
// across all output bits, so similar strings yield uncorrelated hashes.
function fmix(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

// tagColor returns a stable color derived from the tag text hash, so the same
// tag always renders with the same color. The avalanche finalizer plus a
// well-separated hue palette keep even similar tags (e.g. "21" vs "22")
// visually distinct; a second hash varies saturation/lightness to break
// same-hue ties.
export function tagColor(text: string): string {
  const h = fmix(fnv1a(text))
  const h2 = fmix(fnv1a(text) ^ 0x9e3779b9)
  const hue = TAG_HUES[h % TAG_HUES.length]
  const sat = 55 + (h2 % 26)
  const light = 34 + ((h2 >>> 7) % 18)
  return `hsl(${hue}, ${sat}%, ${light}%)`
}
