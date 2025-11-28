import type { TemplateRef } from 'vue'

export function useScroll(chartContainer: TemplateRef<HTMLDivElement | null>, chartWrapper: TemplateRef<HTMLDivElement | null>) {
  async function scrollBottom() {
    setTimeout(() => {
      chartContainer.value?.scrollTo({
        top: chartWrapper.value?.offsetHeight,
        behavior: 'smooth',
      })
    }, 500)
  }

  let resizeObserver: ResizeObserver | undefined

  function scrollBottomObserve() {
    if (!chartWrapper.value)
      return
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        scrollBottom()
      })
    }
    resizeObserver.observe(chartWrapper.value)
  }

  function disScrollBottomObserve() {
    if (!resizeObserver)
      return
    resizeObserver.disconnect()
    resizeObserver = undefined
  }

  function containerScrollListener() {
    const threshold = 80 // 为什么是80 要留一个最新生成的一行的高度
    const scrollTop = chartContainer.value?.scrollTop ?? 0
    const containerHeight = chartContainer.value?.offsetHeight ?? 0
    const wrapperHeight = chartWrapper.value?.offsetHeight ?? 0
    // 滚动到底了
    if (Math.abs(scrollTop + containerHeight - wrapperHeight) < threshold) {
      scrollBottomObserve()
      return
    }
    // 在上面
    disScrollBottomObserve()
  }

  onMounted(() => {
    scrollBottomObserve()
    chartContainer.value?.addEventListener('scroll', containerScrollListener)
  })

  onUnmounted(() => {
    disScrollBottomObserve()
    chartContainer.value?.removeEventListener('scroll', containerScrollListener)
  })

  return {
    scrollBottom,
  }
}
