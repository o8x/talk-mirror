import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { chartPalette } from '../theme/echarts'
import { useStore } from '../store/store'

interface Props {
  data: { ts: number; count: number }[]
  height?: number
  brushable?: boolean
  onBrush?: (startNs: number, endNs: number) => void
}

export default function TrendChart({ data, height = 240, brushable = false, onBrush }: Props) {
  const darkMode = useStore((s) => s.darkMode)
  const themeColor = useStore((s) => s.themeColor)
  const pal = chartPalette(darkMode, themeColor)

  const option = useMemo<EChartsOption>(() => {
    return {
      backgroundColor: 'transparent',
      grid: { left: 44, right: 16, top: 16, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: pal.tooltipBg,
        borderColor: pal.axis,
        textStyle: { color: pal.text, fontSize: 12 },
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: pal.axis } },
        axisLabel: { color: pal.text, fontSize: 11, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisLabel: { color: pal.text, fontSize: 11 },
        splitLine: { lineStyle: { color: pal.splitLine } },
      },
      series: [
        {
          name: 'messages',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: data.map((d) => [Math.floor(d.ts / 1e6), d.count]),
          lineStyle: { color: pal.primary, width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: pal.areaStart },
                { offset: 1, color: pal.areaEnd },
              ],
            },
          },
        },
      ],
      ...(brushable
        ? {
            brush: {
              toolbox: ['rect', 'clear'],
              brushStyle: { color: pal.primary, opacity: 0.3, borderWidth: 1 },
              xAxisIndex: 0,
              throttleType: 'debounce',
              throttleDelay: 300,
            },
            toolbox: { show: true, feature: { brush: { type: ['rect', 'clear'] } }, right: 8, top: 0 },
          }
        : {}),
    }
  }, [data, pal, brushable])

  const onEvents = useMemo<Record<string, Function> | undefined>(() => {
    if (!brushable || !onBrush) return undefined
    return {
      brushSelected: (params: unknown) => {
        const p = params as { batch?: { areas?: { coordRange: number[] }[] }[] }
        const areas = p.batch?.[0]?.areas ?? []
        if (areas.length > 0) {
          const [x0, x1] = areas[0].coordRange
          const start = Math.min(x0, x1)
          const end = Math.max(x0, x1)
          onBrush(Math.floor(start * 1e6), Math.floor(end * 1e6))
        }
      },
    }
  }, [brushable, onBrush])

  return (
    <ReactECharts
      option={option}
      onEvents={onEvents}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  )
}
