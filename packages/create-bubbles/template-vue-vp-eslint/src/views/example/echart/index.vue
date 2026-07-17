<script setup lang="ts">
import { useECharts } from "@/hooks/chart/useEcharts";

import { getOption } from "./config";

const dom = useTemplateRef("chart");
const { setOptions } = useECharts(dom);

onMounted(() => {
  setOptions(getOption());
});
</script>

<template>
  <div class="h-100vh w-full bg-black">
    <div ref="chart" class="h-30% w-30%" />
  </div>
</template>

<style lang="scss" scoped></style>
