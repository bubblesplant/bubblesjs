<script setup lang="ts">
import { CheckOutlined, LoadingOutlined, TranslationOutlined } from '@antdv-next/icons'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Button, Popover } from 'antdv-next'
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'

const { locale, loadLocale, tr } = useI18n()
const open = ref(false)
const pending = ref(false)
const failed = ref(false)
const panel = ref<HTMLElement>()
const list = ref<HTMLElement>()
const trigger = ref<InstanceType<typeof Button>>()
let session = 0
const panelId = `locale-${useId()}`
/** 按当前界面语言生成语言译名；浏览器缺少支持时回退英文名称。 */
const languages = computed(() => {
  const options = [
    { key: 'zh_CN', name: '简体中文', englishName: 'Simplified Chinese', lang: 'zh-Hans' },
    { key: 'en_US', name: 'English', englishName: 'English', lang: 'en' },
  ]
  const displayLocale = locale.value === 'en_US' ? 'en' : 'zh-CN'
  try {
    const displayNames = new Intl.DisplayNames([displayLocale], { type: 'language' })
    return options.map((language) => ({
      ...language,
      description: displayNames.of(language.lang) ?? language.englishName,
    }))
  } catch {
    return options.map((language) => ({ ...language, description: language.englishName }))
  }
})

/** 每次展开或收起均标记新会话，隔离此前尚未完成的语言切换。 */
function changeOpen(value: boolean) {
  if (value === open.value) return
  session += 1
  open.value = value
  failed.value = false
}

/** 等浮层完成挂载后聚焦已选语言，使图标入口支持完整的键盘操作。 */
function focusPanel(value: boolean) {
  if (!value || !open.value) return
  const selected = list.value?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
  const first = list.value?.querySelector<HTMLButtonElement>('button')
  const target = selected ?? first
  target?.focus()
}

/** 切换结束仅关闭原会话；焦点仍在面板内时才将其送回入口。 */
async function selectLanguage(key: string) {
  if (pending.value) return
  const requestSession = session
  pending.value = true
  failed.value = false
  try {
    if (key !== locale.value) await loadLocale(key)
    if (requestSession !== session) return
    const restoreFocus = panel.value?.contains(document.activeElement)
    changeOpen(false)
    if (restoreFocus) trigger.value?.$el?.focus()
  } catch {
    if (requestSession === session) failed.value = true
  } finally {
    pending.value = false
  }
}

/** 焦点通过 Tab 或页面操作离开面板及入口时收起浮层，不干扰外部焦点。 */
function handleFocus(event: FocusEvent) {
  if (!open.value || !(event.target instanceof Node)) return
  if (panel.value?.contains(event.target) || trigger.value?.$el?.contains(event.target)) return
  changeOpen(false)
}

/** Escape 始终收起当前浮层并恢复入口焦点，忽略输入法组合期间的按键。 */
function handleEscape(event: KeyboardEvent) {
  if (!open.value || event.isComposing || event.key !== 'Escape') return
  event.preventDefault()
  changeOpen(false)
  trigger.value?.$el?.focus()
}

/** 菜单支持方向键循环以及 Home、End 首末项定位。 */
function navigate(event: KeyboardEvent) {
  if (event.isComposing) return
  const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  if (!buttons.length) return
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowDown'
          ? (current + 1) % buttons.length
          : event.key === 'ArrowUp'
            ? (current - 1 + buttons.length) % buttons.length
            : -1
  if (index < 0) return
  event.preventDefault()
  buttons[index]?.focus()
}

onMounted(() => {
  document.addEventListener('focusin', handleFocus)
  document.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  session += 1
  document.removeEventListener('focusin', handleFocus)
  document.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <Popover
    :open="open"
    trigger="click"
    placement="bottom"
    destroy-on-hidden
    :classes="{ root: 'locale-switch-popover' }"
    :after-open-change="focusPanel"
    @open-change="changeOpen"
  >
    <template #content>
      <div
        :id="panelId"
        ref="panel"
        role="dialog"
        :aria-labelledby="`${panelId}-title`"
        :aria-busy="pending"
        @keydown="navigate"
      >
        <div class="locale-switch-heading">
          <strong :id="`${panelId}-title`">{{ tr('选择语言') }}</strong
          ><span lang="en">Language</span>
        </div>
        <div ref="list" class="locale-switch-list" role="menu" :aria-label="tr('选择语言')">
          <button
            v-for="language in languages"
            :key="language.key"
            type="button"
            role="menuitemradio"
            class="locale-switch-item"
            :aria-checked="locale === language.key"
            :aria-disabled="pending"
            @click="selectLanguage(language.key)"
          >
            <span class="locale-switch-names"
              ><bdi :lang="language.lang">{{ language.name }}</bdi
              ><small>{{ language.description }}</small></span
            >
            <LoadingOutlined v-if="pending && locale !== language.key" spin aria-hidden="true" />
            <CheckOutlined v-else-if="locale === language.key" aria-hidden="true" />
          </button>
        </div>
        <div v-if="failed" role="alert" class="locale-switch-error">
          {{ tr('语言切换失败，请重试') }}
        </div>
      </div>
    </template>
    <Button
      ref="trigger"
      type="text"
      class="locale-switch-trigger"
      :aria-label="tr('切换语言')"
      :title="tr('切换语言')"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      :aria-busy="pending"
    >
      <template #icon><TranslationOutlined /></template>
    </Button>
  </Popover>
</template>
