<script setup lang="ts">
// 公告展示组件
import type { Announcement } from '~/server/database/schema'

const props = defineProps<{
  maxItems?: number // 最大显示数量，默认显示全部
}>()

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
    <div class="h-10 bg-(--ui-bg-muted) rounded-lg" />
  </div>
  <div v-else-if="hasAnnouncements" class="space-y-2">
    <div
      v-for="announcement in displayAnnouncements"
      :key="announcement.id"
      class="flex items-start gap-3 p-3 rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) relative"
    >
      <!-- 图标 -->
      <div :class="['flex-shrink-0 mt-0.5', getTypeConfig(announcement.type).color]">
        <UIcon :name="announcement.icon || getTypeConfig(announcement.type).icon" class="w-5 h-5" />
      </div>

      <!-- 内容：支持 [文字](URL) 内联链接 -->
      <div class="flex-1 min-w-0 pr-6">
        <p class="text-sm text-(--ui-text) break-words" v-html="renderContent(announcement.content)" />
      </div>

      <!-- 关闭按钮 -->
      <button
        type="button"
        class="absolute top-2 right-2 p-1 rounded hover:bg-(--ui-bg-accented) text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
        @click.stop="dismissAnnouncement(announcement.id)"
      >
        <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
