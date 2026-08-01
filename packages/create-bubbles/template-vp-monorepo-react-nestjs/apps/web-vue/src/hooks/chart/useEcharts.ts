import type { EChartsOption } from 'echarts'

import type { ShallowRef } from 'vue'

import { debounce } from 'radashi'

import echarts from './lib'

type setOptionsType = (options: EChartsOption, clear?: boolean) => void

export function useECharts(
  elRef: Ref<HTMLDivElement> | Readonly<ShallowRef<HTMLDivElement | null>>,
) {
  let chartInstance: echarts.ECharts | null = null
  let resizeObserver: ResizeObserver | undefined

  const resize = () => {
    chartInstance?.resize()
  }

  const initCharts = () => {
    if (!elRef)
      return
    const el = unref(elRef)
    if (!el)
      return

    resizeObserver = new ResizeObserver(
      debounce(
        {
          delay: 100,
        },
        resize,
      ),
    )
    resizeObserver.observe(el)

    chartInstance = echarts.init(el)
  }

  const setOptions: setOptionsType = (options, clear = true) => {
    if (!chartInstance) {
      initCharts()
      if (!chartInstance)
        return
    }
    if (clear)
      chartInstance.clear()
    chartInstance?.setOption(options)
  }

  const getInstance: () => echarts.ECharts | null = () => {
    if (!chartInstance)
      initCharts()
    return chartInstance
  }

  onUnmounted(() => {
    chartInstance?.dispose()
    resizeObserver?.disconnect()
    resizeObserver = undefined
  })

  return {
    setOptions,
    resize,
    echarts,
    getInstance,
  }
}
