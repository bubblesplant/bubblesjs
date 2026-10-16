import type { EChartsOption } from 'echarts'

import type { ShallowRef } from 'vue'

import { debounce } from 'es-toolkit'

import echarts from './lib'

type setOptionsType = (options: EChartsOption, clear?: boolean) => void

/**
 * 管理图表的懒初始化、容器尺寸监听和组件卸载清理。
 * @param elRef 图表容器引用，容器尚未挂载时延后初始化。
 * @returns 设置图表配置、调整尺寸和获取实例的方法及 ECharts 模块。
 */
export function useECharts(
  elRef: Ref<HTMLDivElement> | Readonly<ShallowRef<HTMLDivElement | null>>,
) {
  let chartInstance: echarts.ECharts | null = null
  let resizeObserver: ResizeObserver | undefined

  const resize = () => {
    chartInstance?.resize()
  }
  const debouncedResize = debounce(resize, 100)

  /** 容器就绪后创建图表，并以防抖监听容器尺寸变化。 */
  const initCharts = () => {
    if (!elRef) return
    const el = unref(elRef)
    if (!el) return

    resizeObserver = new ResizeObserver(debouncedResize)
    resizeObserver.observe(el)

    chartInstance = echarts.init(el)
  }

  /**
   * 确保图表已初始化后应用配置；容器未就绪时忽略本次设置。
   * @param options ECharts 图表配置。
   * @param clear 是否先清空已有图表，默认为 `true`。
   */
  const setOptions: setOptionsType = (options, clear = true) => {
    if (!chartInstance) {
      initCharts()
      if (!chartInstance) return
    }
    if (clear) chartInstance.clear()
    chartInstance?.setOption(options)
  }

  /** 按需初始化并返回图表实例；容器未就绪时返回 `null`。 */
  const getInstance: () => echarts.ECharts | null = () => {
    if (!chartInstance) initCharts()
    return chartInstance
  }

  onUnmounted(
    /** 释放尺寸观察器、待执行的防抖回调和图表。 */ () => {
      resizeObserver?.disconnect()
      resizeObserver = undefined
      debouncedResize.cancel()
      chartInstance?.dispose()
    },
  )

  return {
    setOptions,
    resize,
    echarts,
    getInstance,
  }
}
