import {
  BarChart,
  GraphChart,
  LineChart,
  MapChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
} from 'echarts/charts'
import {
  AriaComponent,
  CalendarComponent,
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  TimelineComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
// TODO 如果想换成SVG渲染，就导出SVGRenderer，
//  并且放到 echarts.use 里，注释掉 CanvasRenderer
import { /* SVGRenderer */ CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  PolarComponent,
  AriaComponent,
  ParallelComponent,
  BarChart,
  LineChart,
  PieChart,
  MapChart,
  RadarChart,
  GraphChart,
  // TODO 因为要兼容Online图表自适应打印，所以改成 CanvasRenderer，可能会模糊
  CanvasRenderer,
  PictorialBarChart,
  RadarComponent,
  ToolboxComponent,
  DataZoomComponent,
  VisualMapComponent,
  TimelineComponent,
  CalendarComponent,
  GraphicComponent,
])

export default echarts
