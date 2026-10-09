<script setup lang="ts">
import { clamp } from "@bubblesjs/utils";
import { computed, ref } from "vue";

const inputValue = ref<number | string>(128);
const minimum = ref<number | string>(0);
const maximum = ref<number | string>(100);
const presets = [
  { label: "低于下限", value: -24 },
  { label: "落在区间", value: 48 },
  { label: "高于上限", value: 128 },
];

function isValidNumber(value: number | string) {
  return value !== "" && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1000;
}

const error = computed(() => {
  if (![inputValue.value, minimum.value, maximum.value].every(isValidNumber)) {
    return "请为三个输入填写 −1000 到 1000 之间的数值。";
  }
  if (Number(minimum.value) > Number(maximum.value)) {
    return "下限不能大于上限，请调整区间。";
  }
  return "";
});

const result = computed(() =>
  error.value
    ? null
    : clamp(Number(inputValue.value), Number(minimum.value), Number(maximum.value)),
);

const scale = computed(() => {
  if (error.value) return { start: -40, end: 160 };
  const start = Math.min(Number(inputValue.value), Number(minimum.value), 0);
  const end = Math.max(Number(inputValue.value), Number(maximum.value), 100);
  const padding = Math.max((end - start) * 0.12, 10);
  return { start: start - padding, end: end + padding };
});

function position(value: number | string) {
  return `${((Number(value) - scale.value.start) / (scale.value.end - scale.value.start)) * 100}%`;
}

function displayNumber(value: number) {
  return String(value);
}

const ticks = computed(() =>
  Array.from({ length: 9 }, (_, index) => ({
    position: `${(index / 8) * 100}%`,
    label: new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(
      scale.value.start + ((scale.value.end - scale.value.start) * index) / 8,
    ),
  })),
);

const resultHint = computed(() => {
  if (result.value === null) return "填写有效数值后查看结果";
  if (Number(inputValue.value) < Number(minimum.value)) return "低于下限，返回区间起点";
  if (Number(inputValue.value) > Number(maximum.value)) return "高于上限，返回区间终点";
  return "位于区间内，保留原值";
});

function selectPreset(value: number) {
  inputValue.value = value;
  minimum.value = 0;
  maximum.value = 100;
}
</script>

<template>
  <div class="workbench">
    <header class="site-header">
      <a class="brand" href="#main" aria-label="Mono 开发工作台，跳至主要内容">
        <span class="brand-symbol" aria-hidden="true"><span /><span /><span /></span>
        <span class="brand-name">mono<span class="brand-dot">.</span></span>
        <span class="brand-caption">开发工作台</span>
      </a>
      <div class="workspace-tag"><span aria-hidden="true" />Vue · pnpm workspace</div>
    </header>

    <main id="main">
      <section class="intro" aria-labelledby="page-title">
        <p class="eyebrow">你的下一个项目，从这里开始</p>
        <h1 id="page-title">应用各司其职，<br />代码共同生长。</h1>
        <p class="intro-copy">
          在应用中探索，在共享包中沉淀。这个工作台展示了它们如何连接，也为你的下一步留好了位置。
        </p>
        <a class="text-link" href="#workspace">查看工作区分工 <span aria-hidden="true">↗</span></a>
      </section>

      <section class="demo-panel" aria-labelledby="demo-title">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">共享包 · 即时演示</p>
            <h2 id="demo-title">把数值留在区间内。</h2>
          </div>
          <code class="package-tag">@bubblesjs/utils</code>
        </div>
        <p class="demo-description">调整数值与上下限，看看 <code>clamp()</code> 如何处理边界。</p>

        <div class="presets" role="group" aria-label="选择示例数值">
          <button v-for="preset in presets" :key="preset.value" type="button" :aria-pressed="Number(inputValue) === preset.value &&
            Number(minimum) === 0 &&
            Number(maximum) === 100
            " @click="selectPreset(preset.value)">
            {{ preset.label }}
          </button>
        </div>

        <div class="number-fields">
          <div class="number-field input-field">
            <label for="value">输入值 <span>value</span></label>
            <input id="value" v-model="inputValue" type="number" min="-1000" max="1000" step="any"
              :aria-invalid="!isValidNumber(inputValue)" aria-describedby="demo-help demo-error" />
          </div>
          <div class="number-field">
            <label for="minimum">下限 <span>min</span></label>
            <input id="minimum" v-model="minimum" type="number" min="-1000" max="1000" step="any"
              :aria-invalid="!isValidNumber(minimum) || Number(minimum) > Number(maximum)"
              aria-describedby="demo-help demo-error" />
          </div>
          <div class="number-field">
            <label for="maximum">上限 <span>max</span></label>
            <input id="maximum" v-model="maximum" type="number" min="-1000" max="1000" step="any"
              :aria-invalid="!isValidNumber(maximum) || Number(minimum) > Number(maximum)"
              aria-describedby="demo-help demo-error" />
          </div>
        </div>
        <p id="demo-help" class="field-help">
          支持 −1000 到 1000，可输入小数；下限应小于或等于上限。
        </p>
        <p id="demo-error" class="field-error" role="status">
          {{ error }}
        </p>

        <div class="ruler" aria-hidden="true">
          <div v-if="!error" class="allowed-range" :style="{
            left: position(minimum),
            width: `${Number.parseFloat(position(maximum)) - Number.parseFloat(position(minimum))}%`,
          }" />
          <div class="ruler-line" />
          <div v-for="tick in ticks" :key="tick.position" class="ruler-tick" :style="{ left: tick.position }">
            <span>{{ tick.label }}</span>
          </div>
          <div v-if="!error" class="input-marker" :style="{ left: position(inputValue) }">
            <span>输入 {{ inputValue }}</span><i />
          </div>
          <div v-if="result !== null" class="result-marker" :style="{ left: position(result) }">
            <i /><span>结果 {{ displayNumber(result) }}</span>
          </div>
        </div>

        <div class="result-row" aria-live="polite" aria-atomic="true">
          <div>
            <span class="result-label">返回值</span><output for="value minimum maximum">{{
              result === null ? "—" : displayNumber(result)
              }}</output>
          </div>
          <p>{{ resultHint }}</p>
        </div>
        <div class="code-line">
          <code>clamp({{ inputValue === "" ? "value" : inputValue }},
            {{ minimum === "" ? "min" : minimum }}, {{ maximum === "" ? "max" : maximum }})</code><span>来自共享包源码</span>
        </div>
      </section>

      <section id="workspace" class="workspace-section" aria-labelledby="workspace-title">
        <div class="section-heading">
          <h2 id="workspace-title">一个仓库，清楚的分工。</h2>
          <p>应用消费包，配置统一管理。</p>
        </div>
        <div class="workspace-grid">
          <article class="workspace-item">
            <span class="folder-label">apps/</span>
            <h3>让想法可见</h3>
            <p>Playground 用来交互演示，Docs 用来记录约定。应用通过工作区依赖连接共享包。</p>
            <code>playground · docs</code>
          </article>
          <article class="workspace-item">
            <span class="folder-label">packages/</span>
            <h3>让代码可复用</h3>
            <p>把通用逻辑放进独立包，按需构建、测试与发布。上方的数值示例就来自这里。</p>
            <code>@bubblesjs/utils</code>
          </article>
          <article class="workspace-item">
            <span class="folder-label">tsconfig/</span>
            <h3>让约定保持一致</h3>
            <p>集中维护 TypeScript 配置。格式、检查与任务编排由根目录统一管理。</p>
            <code>tsconfig</code>
          </article>
        </div>
      </section>

      <section class="next-step" aria-labelledby="next-title">
        <div>
          <p class="eyebrow">接下来</p>
          <h2 id="next-title">从一个共享函数开始。</h2>
          <p>编辑 <code>packages/utils/src/index.ts</code>，回到这里查看变化。</p>
        </div>
        <div class="command-list">
          <div><span>运行工作台</span><code>pnpm dev</code></div>
          <div><span>检查整个仓库</span><code>pnpm check</code></div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <span>少一点重复，多一点专注。</span><span>MONOREPO STARTER / PLAYGROUND</span>
    </footer>
  </div>
</template>
