<script setup lang="ts">
import type { Task } from '~/composables/useTasks'
import type { ImageModelType, VideoModelType } from '../../shared/types'
import { getCardDisplay, getApiFormatLabel } from '../../shared/registry'

const props = defineProps<{
  task: Task
}>()

const open = defineModel<boolean>('open', { default: false })

const { formatImageUrl } = useImageUrl()

// 获取模型显示信息
const modelInfo = computed(() => {
  const modelType = props.task.modelType as ImageModelType | VideoModelType
  const display = getCardDisplay(modelType) || { label: modelType || '未知', color: 'bg-gray-500/80' }
  return {
    label: display.label,
    type: modelType,
    color: display.color,
  }
})

// 获取状态显示
const statusInfo = computed(() => {
  // 检查是否已过期
  if (props.task.deletedAt) {
    return { text: '已过期', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-clock', isExpired: true }
  }

  // 检查文件是否已被删除
  if (props.task.resourceDeleted) {
    return { text: '文件已删除', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-trash', isExpired: true, isFileDeleted: true }
  }

  switch (props.task.status) {
    case 'pending':
      return { text: '等待中', color: 'text-(--ui-warning)' }
    case 'submitting':
      return { text: '提交中', color: 'text-(--ui-info)' }
    case 'processing':
      return { text: props.task.progress || '生成中', color: 'text-(--ui-primary)' }
    case 'success':
      return { text: '已完成', color: 'text-(--ui-success)' }
    case 'failed':
      return { text: '失败', color: 'text-(--ui-error)' }
    case 'cancelled':
      return { text: '已取消', color: 'text-(--ui-text-muted)' }
    default:
      return { text: '未知', color: 'text-(--ui-text-muted)' }
  }
})

// 实时时间戳，用于驱动生成中耗时的自动刷新
const now = ref(Date.now())
let intervalId: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  intervalId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

// 计算耗时
const duration = computed(() => {
  if (!props.task.createdAt) return null
  const start = new Date(props.task.createdAt).getTime()
  const end = props.task.status === 'success' || props.task.status === 'failed'
    ? new Date(props.task.updatedAt).getTime()
    : now.value
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  return `${minutes}分${remainSeconds}秒`
})

// 任务类型显示
const taskTypeLabel = computed(() => {
  if (props.task.taskType === 'video') {
    return '视频生成'
  }
  return props.task.type === 'blend' ? '图片混合' : '文生图'
})
</script>

<template>
  <UModal v-model:open="open" title="任务详情">
    <template #body>
      <!-- 图片预览区域 -->
      <div
        class="mb-4 rounded-lg overflow-hidden border border-(--ui-border)"
        :class="task.resourceUrl && !task.resourceDeleted ? 'aspect-video checkerboard-bg' : 'aspect-video bg-(--ui-bg-muted)'"
      >
        <img
          v-if="task.resourceUrl && !task.resourceDeleted"
          :src="formatImageUrl(task.resourceUrl)"
          :alt="task.prompt ?? ''"
          class="w-full h-full object-contain"
        />
        <div v-else class="w-full h-full flex items-center justify-center p-4">
          <div class="text-center">
            <UIcon
              v-if="statusInfo.icon"
              :name="statusInfo.icon"
              :class="['w-16 h-16 mb-3', statusInfo.color]"
            />
            <p :class="['text-base mb-1', statusInfo.color]">{{ statusInfo.text }}</p>
            <p v-if="statusInfo.isExpired" class="text-(--ui-text-dimmed) text-sm">
              {{ statusInfo.isFileDeleted ? '文件已被清理，无法查看' : '数据已过期，无法查看' }}
            </p>
          </div>
        </div>
      </div>

      <div class="space-y-3 text-sm">
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">任务ID</span>
          <span class="font-mono text-(--ui-text)">{{ task.id }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">任务类型</span>
          <span class="text-(--ui-text)">{{ taskTypeLabel }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">上游</span>
          <span class="text-(--ui-text)">{{ task.upstream?.name || '未知' }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">模型类型</span>
          <span class="text-(--ui-text)">{{ modelInfo.label }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">请求格式</span>
          <span class="text-(--ui-text)">{{ getApiFormatLabel(task.apiFormat) }}</span>
        </div>
        <div v-if="task.modelName" class="flex justify-between">
          <span class="text-(--ui-text-muted)">模型名称</span>
          <span class="text-(--ui-text) font-mono text-xs">{{ task.modelName }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">状态</span>
          <span :class="statusInfo.color">{{ statusInfo.text }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-(--ui-text-muted)">创建时间</span>
          <span class="text-(--ui-text)">{{ new Date(task.createdAt).toLocaleString('zh-CN') }}</span>
        </div>
        <div v-if="duration" class="flex justify-between">
          <span class="text-(--ui-text-muted)">耗时</span>
          <span class="text-(--ui-text)">{{ duration }}</span>
        </div>
        <div v-if="task.upstreamTaskId" class="flex justify-between">
          <span class="text-(--ui-text-muted)">上游任务ID</span>
          <span class="font-mono text-xs text-(--ui-text)">{{ task.upstreamTaskId }}</span>
        </div>
        <div v-if="task.prompt">
          <span class="text-(--ui-text-muted) block mb-1">提示词</span>
          <p class="text-(--ui-text) bg-(--ui-bg-muted) rounded p-2 text-xs break-all">{{ task.prompt }}</p>
        </div>
        <div v-if="task.modelParams && Object.keys(task.modelParams).length > 0">
          <span class="text-(--ui-text-muted) block mb-1">模型参数</span>
          <p class="text-(--ui-text) bg-(--ui-bg-muted) rounded p-2 text-xs break-all">{{ JSON.stringify(task.modelParams) }}</p>
        </div>
        <div v-if="task.error">
          <span class="text-(--ui-text-muted) block mb-1">错误信息</span>
          <p class="text-(--ui-error) bg-(--ui-error)/10 rounded p-2 text-xs break-all">{{ task.error }}</p>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.checkerboard-bg {
  background-image:
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  background-color: #fff;
}

:root.dark .checkerboard-bg {
  background-image:
    linear-gradient(45deg, #3a3a3a 25%, transparent 25%),
    linear-gradient(-45deg, #3a3a3a 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #3a3a3a 75%),
    linear-gradient(-45deg, transparent 75%, #3a3a3a 75%);
  background-color: #2a2a2a;
}
</style>
