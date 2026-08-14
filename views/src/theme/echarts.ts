export interface ChartPalette {
  text: string
  axis: string
  splitLine: string
  primary: string
  areaStart: string
  areaEnd: string
  tooltipBg: string
}

export function chartPalette(dark: boolean, primary: string): ChartPalette {
  const areaStart = dark ? 'rgba(59,165,93,0.35)' : 'rgba(198,40,40,0.22)'
  return {
    text: dark ? '#a7b8b0' : '#5f6b66',
    axis: dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
    splitLine: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    primary,
    areaStart,
    areaEnd: 'rgba(0,0,0,0)',
    tooltipBg: dark ? '#1c2622' : '#ffffff',
  }
}
