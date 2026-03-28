<script setup lang="ts">
// 公告展示组件
import type { Announcement } from '~/server/database/schema'

const props = withDefaults(
  defineProps<{
    maxItems?: number // 最大显示数量，默认显示全部
    /** 紧凑样式（创作工作台等场景，减少垂直占用） */
    compact?: boolean
  }>(),
  { compact: false },
)

// 每次页面加载都从服务器获取最新公告
const { data, pending } = await useFetch<{ success: boolean; data: Announcement[] }>('/api/announcements')

// 已关闭的公告 ID 列表（仅当前 session 有效，刷新页面后会重新显示）
const dismissedIds = ref<Set<number>>(new Set())

// 关闭公告（仅当前页面 session 有效，刷新后恢复）
function dismissAnnouncement(id: number) {
  dismissedIds.value.add(id)
}

// 根据类型获取图标和颜色
function getTypeConfig(type: string) {
  switch (type) {
    case 'warning':
      return {
        icon: 'i-heroicons-exclamation-triangle',
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
      }
    case 'success':
      return {
        icon: 'i-heroicons-check-circle',
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
      }
    case 'error':
      return {
        icon: 'i-heroicons-x-circle',
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
      }
    case 'info':
    default:
      return {
        icon: 'i-heroicons-information-circle',
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
      }
  }
}

// 解析 content 中的 [text](url) Markdown 链接语法，转换为 HTML
function renderContent(content: string): string {
  // 先转义 HTML 特殊字符
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // 解析 [text](url) 格式
  return escaped.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" class="text-(--ui-primary) font-medium hover:opacity-80 underline underline-offset-2">$1</a>'
  )
}

// 显示的公告列表（过滤掉已关闭的）
const displayAnnouncements = computed(() => {
  if (!data.value?.data) return []
  const list = data.value.data.filter(a => !dismissedIds.value.has(a.id))
  return props.maxItems ? list.slice(0, props.maxItems) : list
})

// 是否有公告
const hasAnnouncements = computed(() => displayAnnouncements.value.length > 0)
</script>

<template>
  <div v-if="pending" class="animate-pulse">
    <div
      class="bg-(--ui-bg-muted) rounded-lg"
      :class="compact ? 'h-7' : 'h-10'"
    />
  </div>
  <!-- 多条公告共用一个外框 -->
  <div
    v-else-if="hasAnnouncements"
    class="relative rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)"
    :class="compact ? 'px-3 py-2 pr-8' : 'px-4 py-3 pr-10'"
  >
    <!-- 公告列表（图标+内容横向排列，全部居中对齐） -->
    <div class="space-y-1">
      <div
        v-for="announcement in displayAnnouncements"
        :key="announcement.id"
        class="flex items-center gap-2"
      >
        <!-- 图标 -->
        <UIcon
          :name="announcement.icon || getTypeConfig(announcement.type).icon"
          :class="[
            getTypeConfig(announcement.type).color,
            compact ? 'size-4 shrink-0' : 'size-5 shrink-0',
          ]"
        />

        <!-- 内容：支持 [文字](URL) 内联链接 -->
        <p
          class="min-w-0 flex-1 text-(--ui-text) break-words leading-snug [&_a]:underline [&_a]:underline-offset-2"
          :class="compact ? 'text-sm' : 'text-base'"
          v-html="renderContent(announcement.content)"
        />
      </div>
    </div>

    <!-- 统一关闭按钮（右上角 absolute） -->
    <button
      type="button"
      class="absolute top-2 right-2 rounded text-(--ui-text-muted) transition-colors hover:bg-(--ui-bg-accented) hover:text-(--ui-text)"
      :class="compact ? 'p-1' : 'p-1.5'"
      @click.stop="dismissAnnouncement(displayAnnouncements[0].id)"
    >
      <UIcon name="i-heroicons-x-mark" class="size-4" />
    </button>
  </div>
</template>
