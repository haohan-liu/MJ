<script setup lang="ts">
import type { Task } from '~/composables/useTasks'
import type { ImageModelType, ImageModelParams } from '../../shared/types'
import { formatDuration } from '~/composables/useTimeFormat'
import { getCardDisplay } from '../../shared/registry'
import {
  DEFAULT_FALLBACK_ESTIMATED_TIME,
  PROGRESS_UPDATE_INTERVAL_MS,
  PROGRESS_TIME_BUFFER_RATIO,
} from '../../shared/constants'

const { formatImageUrl } = useImageUrl()

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  action: [customId: string]
  remove: []
  retry: []
  cancel: []
  blur: [isBlurred: boolean]
  copyToPanel: [prompt: string | null, modelParams: ImageModelParams | null, images: string[]]
}>()

const isActioning = ref(false)

const toast = useToast()

// 复制任务ID
async function copyTaskId() {
  const taskId = String(props.task.id)
  try {
    await navigator.clipboard.writeText(taskId)
    toast.add({ title: '已复制', description: `ID:${taskId}`, color: 'success' })
  } catch {
    // fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = taskId
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    toast.add({ title: '已复制', description: `ID:${taskId}`, color: 'success' })
  }
}

// 图片模糊状态（防窥屏）- 从任务数据初始化
const isBlurred = ref(props.task.isBlurred ?? true)

// 监听外部状态变化（用于批量切换）
watch(() => props.task.isBlurred, (newVal) => {
  if (newVal !== undefined) {
    isBlurred.value = newVal
  }
})

// 切换模糊状态并同步到后端
async function toggleBlur(blur: boolean) {
  isBlurred.value = blur
  emit('blur', blur)
  try {
    await $fetch(`/api/tasks/${props.task.id}/blur`, {
      method: 'PATCH',
      body: { isBlurred: blur },
    })
  } catch (error) {
    console.error('保存模糊状态失败:', error)
  }
}

// 获取状态显示
const statusInfo = computed(() => {
  // 检查是否已删除/过期
  if (props.task.deletedAt) {
    return { text: '已过期', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-clock', showBars: false, isExpired: true }
  }
  
  // 检查文件是否已被删除
  if (props.task.resourceDeleted) {
    return { text: '文件已删除', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-trash', showBars: false, isExpired: true, isFileDeleted: true }
  }
  
  switch (props.task.status) {
    case 'pending':
      return { text: '等待中', color: 'text-(--ui-warning)', icon: 'i-heroicons-clock', showBars: false }
    case 'submitting':
      return { text: '提交中', color: 'text-(--ui-info)', icon: 'i-heroicons-stop', showBars: true }
    case 'processing':
      return { text: props.task.progress || '生成中', color: 'text-(--ui-primary)', icon: null, showBars: true }
    case 'success':
      return { text: '已完成', color: 'text-(--ui-success)', icon: 'i-heroicons-check-circle', showBars: false }
    case 'failed':
      return { text: '失败', color: 'text-(--ui-error)', icon: 'i-heroicons-x-circle', showBars: false }
    case 'cancelled':
      return { text: '已取消', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-no-symbol', showBars: false }
    default:
      return { text: '未知', color: 'text-(--ui-text-muted)', icon: 'i-heroicons-question-mark-circle', showBars: false }
  }
})

// 获取模型显示信息
const modelInfo = computed(() => {
  const modelType = props.task.modelType as ImageModelType
  const display = getCardDisplay(modelType) || { label: modelType || '未知', color: 'bg-gray-500/80' }

  return {
    label: props.task.upstream?.aimodelName || display.label,  // 优先使用 aimodelName
    type: modelType,
    color: display.color,
  }
})

// 是否显示加载动画
const isLoading = computed(() => ['pending', 'submitting', 'processing'].includes(props.task.status))

// 获取当前任务的预计时间（秒）（使用共享常量 DEFAULT_FALLBACK_ESTIMATED_TIME）
const estimatedTime = computed(() => {
  return props.task.upstream?.estimatedTime ?? DEFAULT_FALLBACK_ESTIMATED_TIME
})

// 进度条：当前时间（定时更新）
const now = ref(Date.now())
let progressTimer: ReturnType<typeof setInterval> | null = null

// 启动/停止进度条计时器（使用共享常量 PROGRESS_UPDATE_INTERVAL_MS）
watch(isLoading, (loading) => {
  if (loading) {
    now.value = Date.now()
    progressTimer = setInterval(() => {
      now.value = Date.now()
    }, PROGRESS_UPDATE_INTERVAL_MS)
  } else if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}, { immediate: true })

onUnmounted(() => {
  if (progressTimer) clearInterval(progressTimer)
})

// 进度百分比（使用共享常量 PROGRESS_TIME_BUFFER_RATIO 作为时长缓冲系数）
const progressPercent = computed(() => {
  if (!isLoading.value) return 0
  const start = new Date(props.task.createdAt).getTime()
  const elapsed = (now.value - start) / 1000
  const bufferedTime = estimatedTime.value * PROGRESS_TIME_BUFFER_RATIO
  return Math.min((elapsed / bufferedTime) * 100, 100)
})

// 格式化耗时显示（仅在任务完成时显示）
const duration = computed(() => {
  if (!['success', 'failed'].includes(props.task.status)) return null
  return formatDuration(props.task.duration!)
})

// 按钮列表（处理null）
const buttons = computed(() => props.task.buttons ?? [])

// 下拉菜单项（分组：放大、变体、重绘）
const dropdownItems = computed(() => {
  const items: any[][] = []

  // 放大 U1-U4
  const upscaleButtons = buttons.value.filter(btn => btn.label.startsWith('U'))
  if (upscaleButtons.length > 0) {
    items.push([
      { label: '放大', type: 'label' },
      ...upscaleButtons.map(btn => ({
        label: btn.label,
        icon: 'i-heroicons-arrows-pointing-out',
        onSelect: () => handleAction(btn.customId)
      }))
    ])
  }

  // 变体 V1-V4
  const variationButtons = buttons.value.filter(btn => btn.label.startsWith('V'))
  if (variationButtons.length > 0) {
    items.push([
      { label: '变体', type: 'label' },
      ...variationButtons.map(btn => ({
        label: btn.label,
        icon: 'i-heroicons-sparkles',
        onSelect: () => handleAction(btn.customId)
      }))
    ])
  }

  // 重绘
  const rerollButton = buttons.value.find(btn => btn.emoji === '🔄')
  if (rerollButton) {
    items.push([
      {
        label: '重绘',
        icon: 'i-heroicons-arrow-path',
        onSelect: () => handleAction(rerollButton.customId)
      }
    ])
  }

  return items
})

// 执行按钮动作
async function handleAction(customId: string) {
  isActioning.value = true
  try {
    emit('action', customId)
  } finally {
    isActioning.value = false
  }
}

// 删除确认
const showDeleteConfirm = ref(false)

function handleRemove() {
  showDeleteConfirm.value = true
}

function confirmDelete() {
  showDeleteConfirm.value = false
  emit('remove')
}

// 查看大图
const showImagePreview = ref(false)

// 点击图片切换模糊状态
function handleImageClick() {
  toggleBlur(!isBlurred.value)
}

// 是否有参考图
const hasRefImages = computed(() => props.task.images && props.task.images.length > 0)

// 任务详情弹窗
const showTaskDetail = ref(false)

// 参考图预览弹窗
const showRefImages = ref(false)

// 下载图片
function downloadImage() {
  const rawUrl = props.task.resourceUrl
  if (!rawUrl) return

  const fullUrl = formatImageUrl(rawUrl)

  // 从 URL 中提取原文件名
  const urlPath = fullUrl.split('?')[0] // 移除查询参数
  const originalFileName = urlPath?.split('/').pop() || `mj-${props.task.id}.png`

  const a = document.createElement('a')
  a.href = fullUrl
  a.download = originalFileName
  a.target = '_blank'
  a.click()
}

// 图片渐进式加载状态（不影响防窥屏模糊功能）
const imageLoaded = ref(false)
const imageError = ref(false)
const shouldLoadImage = ref(false)
const imageContainerRef = ref<HTMLElement | null>(null)

// 加载延迟时间（毫秒）- 控制服务器负载，延迟请求让骨架屏先显示
const LOAD_DELAY_MS = 600

// 高并发保护：全局请求队列，限制同时加载的图片数量
const MAX_CONCURRENT_LOADS = 4
let currentLoadingCount = 0
const loadingQueue: Array<() => void> = []

function processQueue() {
  if (currentLoadingCount < MAX_CONCURRENT_LOADS && loadingQueue.length > 0) {
    const next = loadingQueue.shift()
    if (next) next()
  }
}

function requestImageLoad(callback: () => void) {
  if (currentLoadingCount < MAX_CONCURRENT_LOADS) {
    currentLoadingCount++
    callback()
  } else {
    loadingQueue.push(() => {
      currentLoadingCount++
      callback()
    })
  }
}

function releaseImageLoad() {
  currentLoadingCount = Math.max(0, currentLoadingCount - 1)
  processQueue()
}

// 使用 IntersectionObserver 实现真正的懒加载 + 优雅占位
let observer: IntersectionObserver | null = null

function setupImageObserver() {
  if (!import.meta.client || !imageContainerRef.value || observer) return

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !shouldLoadImage.value) {
          // 延迟加载，减少首屏并发请求
          setTimeout(() => {
            requestImageLoad(() => {
              shouldLoadImage.value = true
            })
          }, LOAD_DELAY_MS)
          observer?.disconnect()
        }
      })
    },
    {
      rootMargin: '0px',
      threshold: 0,
    }
  )

  observer.observe(imageContainerRef.value)
}

function onImageLoad() {
  imageLoaded.value = true
  imageError.value = false
  releaseImageLoad()
}

function onImageError() {
  imageError.value = true
  imageLoaded.value = false
  releaseImageLoad()
}

onMounted(() => {
  setupImageObserver()
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

</script>

<template>
  <div class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-lg border border-(--ui-border) overflow-hidden">
    <!-- 图片预览 -->
    <div
      ref="imageContainerRef"
      class="aspect-square relative"
      :class="task.resourceUrl && !task.resourceDeleted && !isBlurred ? 'checkerboard-bg' : 'bg-(--ui-bg-muted)'"
    >
      <!-- 优雅的骨架屏占位层（图片未加载或加载中时显示，完全覆盖背景） -->
      <Transition name="skeleton-fade">
        <div
          v-if="task.resourceUrl && !task.resourceDeleted && !imageLoaded"
          class="absolute inset-0 z-10 overflow-hidden rounded-none"
          aria-hidden="true"
        >
          <!-- 纯色背景层（完全不透明，确保覆盖一切背景） -->
          <div class="absolute inset-0 bg-(--ui-bg)" />
          
          <!-- 彩色模糊光斑背景层 - 脉动呼吸效果 -->
          <div class="absolute inset-0 overflow-hidden animate-breathe">
            <div class="absolute -top-1/4 -left-1/4 w-full h-full rounded-full animate-float-blur animate-float-blur-1" />
            <div class="absolute -top-1/3 -right-1/4 w-4/5 h-4/5 rounded-full animate-float-blur animate-float-blur-2" />
            <div class="absolute -bottom-1/4 -left-1/3 w-3/4 h-3/4 rounded-full animate-float-blur animate-float-blur-3" />
          </div>
          
          <!-- 优雅渐变光晕叠加 -->
          <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10 animate-shimmer" />
          
          <!-- 高级轮廓光效果 -->
          <div class="absolute inset-0 animate-border-glow">
            <div class="absolute inset-[1px] rounded-sm bg-gradient-to-br from-purple-500/30 via-transparent to-cyan-500/30" />
          </div>
          
          <!-- 抽象能量流加载动画 -->
          <div class="absolute inset-0 flex items-center justify-center overflow-hidden">
            <!-- 抽象流动线条 -->
            <svg class="w-28 h-28 opacity-60" viewBox="0 0 100 100">
              <!-- 流动曲线1 -->
              <path 
                class="animate-flow-path-1"
                d="M 10 50 Q 25 20, 50 50 T 90 50"
                fill="none"
                stroke="url(#flowGradient1)"
                stroke-width="2"
                stroke-linecap="round"
              />
              <!-- 流动曲线2 -->
              <path 
                class="animate-flow-path-2"
                d="M 20 30 Q 40 60, 60 30 T 80 30"
                fill="none"
                stroke="url(#flowGradient2)"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <!-- 流动曲线3 -->
              <path 
                class="animate-flow-path-3"
                d="M 15 70 Q 35 40, 55 70 T 85 70"
                fill="none"
                stroke="url(#flowGradient3)"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <!-- 流动曲线4 -->
              <path 
                class="animate-flow-path-4"
                d="M 5 50 Q 30 80, 50 50 T 95 50"
                fill="none"
                stroke="url(#flowGradient1)"
                stroke-width="1"
                stroke-linecap="round"
              />
              <!-- 渐变定义 -->
              <defs>
                <linearGradient id="flowGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#a855f7" stop-opacity="0.2" />
                  <stop offset="50%" stop-color="#ec4899" stop-opacity="0.8" />
                  <stop offset="100%" stop-color="#a855f7" stop-opacity="0.2" />
                </linearGradient>
                <linearGradient id="flowGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.2" />
                  <stop offset="50%" stop-color="#ec4899" stop-opacity="0.7" />
                  <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.2" />
                </linearGradient>
                <linearGradient id="flowGradient3" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#a855f7" stop-opacity="0.2" />
                  <stop offset="50%" stop-color="#06b6d4" stop-opacity="0.7" />
                  <stop offset="100%" stop-color="#a855f7" stop-opacity="0.2" />
                </linearGradient>
              </defs>
            </svg>
            
            <!-- 漂浮光点粒子 -->
            <div class="absolute inset-0">
              <div class="absolute w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 animate-particle-1" />
              <div class="absolute w-1.5 h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 animate-particle-2" />
              <div class="absolute w-1 h-1 rounded-full bg-gradient-to-r from-pink-400 to-cyan-400 animate-particle-3" />
              <div class="absolute w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 animate-particle-4" />
              <div class="absolute w-1 h-1 rounded-full bg-gradient-to-r from-pink-400 to-purple-400 animate-particle-5" />
            </div>
          </div>
          
          <!-- 优雅的占位符纹理（高级感） -->
          <div class="absolute inset-0 opacity-[0.03]">
            <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-width="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        </div>
      </Transition>

      <!-- 实际图片（IntersectionObserver 控制加载时机） -->
      <img
        v-if="task.resourceUrl && !task.resourceDeleted && shouldLoadImage"
        :src="formatImageUrl(task.resourceUrl)"
        :alt="task.prompt ?? ''"
        class="w-full h-full object-contain cursor-pointer transition-opacity duration-700 ease-out"
        :class="[
          isBlurred ? 'blur-xl scale-105' : '',
          imageLoaded ? 'opacity-100' : 'opacity-0'
        ]"
        @click="handleImageClick"
        @load="onImageLoad"
        @error="onImageError"
      />

      <!-- 无资源时的占位显示（过期/失败等状态） -->
      <div
        v-if="!task.resourceUrl || task.resourceDeleted || imageError"
        class="w-full h-full flex items-center justify-center p-4"
      >
        <div class="text-center">
          <!-- 竖线加载动画 -->
          <StudioLoader
            v-if="statusInfo.showBars"
            :class="['w-12 h-12 mb-2', statusInfo.color]"
          />
          <!-- 图标 -->
          <UIcon
            v-else-if="statusInfo.icon"
            :name="statusInfo.icon"
            :class="['w-12 h-12 mb-2', statusInfo.color]"
          />
          <p :class="['text-sm mb-2', statusInfo.color]">{{ statusInfo.text }}</p>
          <!-- 过期提示 -->
          <p v-if="statusInfo.isExpired" class="text-(--ui-text-dimmed) text-xs">
            {{ statusInfo.isFileDeleted ? '文件已被清理，无法查看' : '数据已过期，无法查看' }}
          </p>
          <!-- 失败时显示错误信息 -->
          <p v-if="task.error" class="text-(--ui-error) text-xs leading-relaxed line-clamp-3 px-2">
            {{ task.error }}
          </p>
        </div>
      </div>

      <!-- 取消按钮（进行中状态，底部居中显示） -->
      <div
        v-if="['pending', 'submitting'].includes(task.status)"
        class="absolute bottom-16 left-0 right-0 flex justify-center"
      >
        <button
          class="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 text-white/80 text-sm hover:bg-(--ui-warning)/70 transition-colors"
          @click="emit('cancel')"
        >
          <UIcon name="i-heroicons-stop" class="w-4 h-4 inline mr-1" />
          取消任务
        </button>
      </div>

      <!-- 状态角标 -->
      <div
        v-if="task.resourceUrl && task.status !== 'success'"
        class="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm"
      >
        <span :class="['text-xs', statusInfo.color]">{{ statusInfo.text }}</span>
      </div>

      <!-- 左上角按钮组 -->
      <div class="absolute top-2 left-2 flex gap-1">
        <!-- 下载按钮 -->
        <button
          v-if="task.resourceUrl && !task.resourceDeleted"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="下载图片"
          @click="downloadImage"
        >
          <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-white" />
        </button>
        <!-- 放大查看按钮 -->
        <button
          v-if="task.resourceUrl && !task.resourceDeleted"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="放大查看"
          @click="showImagePreview = true"
        >
          <UIcon name="i-heroicons-magnifying-glass-plus" class="w-4 h-4 text-white" />
        </button>
        <!-- MJ操作按钮 -->
        <UDropdownMenu v-if="modelInfo.type === 'midjourney' && buttons.length > 0" :items="dropdownItems">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            title="MJ操作"
            :disabled="isActioning"
          >
            <UIcon name="i-heroicons-squares-plus" class="w-4 h-4 text-white" />
          </button>
        </UDropdownMenu>
        <!-- 重试按钮 -->
        <button
          v-if="task.status === 'failed' || task.status === 'cancelled'"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="重试"
          @click="emit('retry')"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 text-white" />
        </button>
        <!-- 详情按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="详情"
          @click="showTaskDetail = true"
        >
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-white" />
        </button>
        <!-- 复制到工作台按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
          title="复制到工作台"
          @click="emit('copyToPanel', task.prompt, task.modelParams as ImageModelParams | null, task.images)"
        >
          <UIcon name="i-heroicons-document-duplicate" class="w-4 h-4 text-white" />
        </button>
        <!-- 删除按钮 -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-(--ui-error)/70 transition-colors"
          title="删除"
          @click="handleRemove"
        >
          <UIcon name="i-heroicons-trash" class="w-4 h-4 text-white" />
        </button>
      </div>

      <!-- 模型标签 -->
      <div
        class="absolute bottom-2 left-2 px-2 py-1 rounded-full text-xs text-white font-medium"
        :class="modelInfo.color"
      >
        {{ modelInfo.label }}
      </div>

      <!-- 参考图角标 -->
      <button
        v-if="hasRefImages"
        class="absolute bottom-2 right-2 px-2 py-1 rounded-full text-xs text-white font-medium bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors flex items-center gap-1"
        title="查看参考图"
        @click="showRefImages = true"
      >
        <UIcon name="i-heroicons-photo" class="w-3.5 h-3.5" />
        <span>参考图 {{ task.images.length }}</span>
      </button>

      <!-- 进度条（进行中状态显示） -->
      <div
        v-if="isLoading"
        class="absolute bottom-0 left-0 right-0 h-[3px] bg-black/20 overflow-hidden"
      >
        <div
          class="h-full transition-all duration-500 ease-out animate-shimmer"
          :style="{
            width: `${progressPercent}%`,
            backgroundImage: 'linear-gradient(90deg, #8b5cf6, #ec4899, #06b6d4, #8b5cf6)',
            backgroundSize: '200% 100%',
          }"
        />
      </div>
    </div>

    <!-- 信息区 -->
    <div class="px-3.5 pt-3 pb-3.5 sm:px-4 sm:pt-3.5 sm:pb-4">
      <!-- 任务ID和时间信息 -->
      <div class="flex items-start justify-between gap-2 text-(--ui-text-dimmed) text-[0.6875rem] sm:text-xs mb-2 leading-relaxed">
        <div class="flex items-center gap-2">
          <span
            class="font-mono bg-(--ui-bg-accented) px-1.5 py-0.5 rounded cursor-pointer hover:bg-(--ui-bg-inverted)/20 select-none"
            title="点击复制"
            @click="copyTaskId"
          >ID:{{ task.id }}</span>
          <TimeAgo :time="task.createdAt" />
        </div>
        <span v-if="duration">耗时 {{ duration }}</span>
      </div>

      <!-- 提示词 -->
      <p class="text-(--ui-text-muted) text-[0.8125rem] sm:text-sm line-clamp-2 leading-snug mb-0" :title="task.prompt ?? ''">
        <span class="text-(--ui-text-dimmed)">提示词：</span>{{ task.prompt || '图片混合' }}
      </p>

    </div>

    <!-- 删除确认 Modal -->
    <UModal v-model:open="showDeleteConfirm" title="确认删除" description="确定要删除这个任务吗？此操作不可撤销。" :close="false">
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="error" @click="confirmDelete">删除</UButton>
          <UButton variant="outline" color="neutral" @click="showDeleteConfirm = false">取消</UButton>
        </div>
      </template>
    </UModal>

    <!-- 任务详情 Modal -->
    <StudioTaskDetailModal v-model:open="showTaskDetail" :task="task" />

    <!-- 大图预览 Modal -->
    <UModal v-model:open="showImagePreview" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="relative bg-(--ui-bg) flex items-center justify-center">
          <!-- 预览图片占位骨架 -->
          <div
            v-if="task.resourceUrl && !imageLoaded"
            class="absolute inset-0 z-10 flex items-center justify-center"
          >
            <div class="w-16 h-16 border-4 border-(--ui-border) border-t-(--ui-primary) rounded-full animate-spin" />
          </div>
          <img
            v-if="task.resourceUrl"
            :src="formatImageUrl(task.resourceUrl)"
            :alt="task.prompt ?? ''"
            class="max-h-[85vh] transition-opacity duration-300"
            :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
            @load="onImageLoad"
            @error="onImageError"
          />
          <!-- 关闭按钮 -->
          <button
            class="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            @click="showImagePreview = false"
          >
            <UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-white" />
          </button>
          <!-- 下载按钮 -->
          <button
            class="absolute top-3 left-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
            title="下载图片"
            @click="downloadImage"
          >
            <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 text-white" />
          </button>
        </div>
      </template>
    </UModal>

    <!-- 参考图预览 Modal -->
    <StudioRefImagesModal v-model:open="showRefImages" :images="task.images" />
  </div>
</template>

<style scoped>
/* 骨架屏淡出过渡动画 */
.skeleton-fade-leave-active {
  transition: opacity 0.8s ease-out;
}

.skeleton-fade-leave-to {
  opacity: 0;
}

/* 呼吸动画 - 让整体有生命感 */
@keyframes breathe {
  0%, 100% {
    opacity: 0.7;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.02);
  }
}

.animate-breathe {
  animation: breathe 4s ease-in-out infinite;
}

/* 轮廓光效果 */
@keyframes border-glow {
  0%, 100% {
    opacity: 0.3;
    filter: blur(0px);
  }
  50% {
    opacity: 0.6;
    filter: blur(2px);
  }
}

.animate-border-glow {
  animation: border-glow 3s ease-in-out infinite;
}

/* 骨架屏 shimmer 动画 - 更柔和的流光 */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-shimmer {
  background: linear-gradient(
    105deg,
    transparent 10%,
    rgba(168, 85, 247, 0.08) 35%,
    rgba(236, 72, 153, 0.06) 50%,
    rgba(6, 182, 212, 0.05) 65%,
    transparent 90%
  );
  background-size: 200% 100%;
  animation: shimmer 5s infinite linear;
}

:root.dark .animate-shimmer {
  background: linear-gradient(
    105deg,
    transparent 10%,
    rgba(168, 85, 247, 0.12) 35%,
    rgba(236, 72, 153, 0.09) 50%,
    rgba(6, 182, 212, 0.07) 65%,
    transparent 90%
  );
  background-size: 200% 100%;
}

/* 彩色模糊光斑动画 - 梦幻飘渺感 */
@keyframes float-blur-1 {
  0%, 100% {
    transform: translate(0, 0) scale(1.2) rotate(0deg);
    opacity: 0.6;
    filter: blur(35px) brightness(1);
  }
  25% {
    transform: translate(12px, -18px) scale(1.35) rotate(5deg);
    opacity: 0.8;
    filter: blur(40px) brightness(1.1);
  }
  50% {
    transform: translate(-8px, 12px) scale(1.15) rotate(-3deg);
    opacity: 0.55;
    filter: blur(32px) brightness(0.95);
  }
  75% {
    transform: translate(5px, -8px) scale(1.28) rotate(2deg);
    opacity: 0.75;
    filter: blur(38px) brightness(1.05);
  }
}

@keyframes float-blur-2 {
  0%, 100% {
    transform: translate(0, 0) scale(1.1) rotate(0deg);
    opacity: 0.5;
    filter: blur(38px) brightness(1);
  }
  33% {
    transform: translate(-15px, 10px) scale(1.25) rotate(-6deg);
    opacity: 0.7;
    filter: blur(42px) brightness(1.1);
  }
  66% {
    transform: translate(10px, -12px) scale(1.0) rotate(4deg);
    opacity: 0.45;
    filter: blur(35px) brightness(0.9);
  }
}

@keyframes float-blur-3 {
  0%, 100% {
    transform: translate(0, 0) scale(1.15) rotate(0deg);
    opacity: 0.55;
    filter: blur(36px) brightness(1);
  }
  50% {
    transform: translate(8px, 15px) scale(1.3) rotate(-4deg);
    opacity: 0.75;
    filter: blur(42px) brightness(1.15);
  }
}

.animate-float-blur {
  mix-blend-mode: screen;
  animation-duration: 6s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  animation-iteration-count: infinite;
}

.animate-float-blur-1 {
  background: radial-gradient(circle, rgba(168, 85, 247, 0.9) 0%, rgba(139, 92, 246, 0.5) 40%, transparent 70%);
  animation-name: float-blur-1;
}

.animate-float-blur-2 {
  background: radial-gradient(circle, rgba(236, 72, 153, 0.8) 0%, rgba(219, 39, 119, 0.45) 40%, transparent 70%);
  animation-name: float-blur-2;
  animation-delay: -2s;
}

.animate-float-blur-3 {
  background: radial-gradient(circle, rgba(6, 182, 212, 0.8) 0%, rgba(8, 145, 178, 0.45) 40%, transparent 70%);
  animation-name: float-blur-3;
  animation-delay: -4s;
}

:root.dark .animate-float-blur-1 {
  background: radial-gradient(circle, rgba(168, 85, 247, 0.7) 0%, rgba(139, 92, 246, 0.4) 40%, transparent 70%);
}

:root.dark .animate-float-blur-2 {
  background: radial-gradient(circle, rgba(236, 72, 153, 0.6) 0%, rgba(219, 39, 119, 0.35) 40%, transparent 70%);
}

:root.dark .animate-float-blur-3 {
  background: radial-gradient(circle, rgba(6, 182, 212, 0.6) 0%, rgba(8, 145, 178, 0.35) 40%, transparent 70%);
}

/* 抽象流动曲线动画 */
@keyframes flow-path-1 {
  0% {
    stroke-dashoffset: 200;
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
  100% {
    stroke-dashoffset: -200;
    opacity: 0.3;
  }
}

@keyframes flow-path-2 {
  0% {
    stroke-dashoffset: 150;
    opacity: 0.2;
  }
  50% {
    opacity: 0.8;
  }
  100% {
    stroke-dashoffset: -150;
    opacity: 0.2;
  }
}

@keyframes flow-path-3 {
  0% {
    stroke-dashoffset: 180;
    opacity: 0.25;
  }
  50% {
    opacity: 0.85;
  }
  100% {
    stroke-dashoffset: -180;
    opacity: 0.25;
  }
}

@keyframes flow-path-4 {
  0% {
    stroke-dashoffset: 220;
    opacity: 0.15;
  }
  50% {
    opacity: 0.6;
  }
  100% {
    stroke-dashoffset: -220;
    opacity: 0.15;
  }
}

.animate-flow-path-1 {
  stroke-dasharray: 30 15;
  animation: flow-path-1 3s linear infinite;
}

.animate-flow-path-2 {
  stroke-dasharray: 25 12;
  animation: flow-path-2 2.5s linear infinite;
  animation-delay: -0.8s;
}

.animate-flow-path-3 {
  stroke-dasharray: 20 10;
  animation: flow-path-3 2.8s linear infinite;
  animation-delay: -1.5s;
}

.animate-flow-path-4 {
  stroke-dasharray: 35 18;
  animation: flow-path-4 3.5s linear infinite;
  animation-delay: -2s;
}

/* 漂浮粒子动画 - 自由飘动 */
@keyframes particle-1 {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 0;
  }
  10% {
    opacity: 0.8;
  }
  50% {
    transform: translate(40px, -30px) scale(1.2);
    opacity: 1;
  }
  90% {
    opacity: 0.6;
  }
  100% {
    transform: translate(60px, 20px) scale(0.8);
    opacity: 0;
  }
}

@keyframes particle-2 {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 0;
  }
  15% {
    opacity: 0.7;
  }
  50% {
    transform: translate(-30px, -40px) scale(1.1);
    opacity: 0.9;
  }
  85% {
    opacity: 0.5;
  }
  100% {
    transform: translate(-50px, 30px) scale(0.6);
    opacity: 0;
  }
}

@keyframes particle-3 {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 0;
  }
  20% {
    opacity: 0.9;
  }
  50% {
    transform: translate(25px, 35px) scale(1.3);
    opacity: 0.8;
  }
  80% {
    opacity: 0.4;
  }
  100% {
    transform: translate(-20px, -25px) scale(0.5);
    opacity: 0;
  }
}

@keyframes particle-4 {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 0;
  }
  12% {
    opacity: 0.6;
  }
  50% {
    transform: translate(-45px, 25px) scale(1.15);
    opacity: 1;
  }
  88% {
    opacity: 0.5;
  }
  100% {
    transform: translate(35px, -35px) scale(0.7);
    opacity: 0;
  }
}

@keyframes particle-5 {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 0;
  }
  18% {
    opacity: 0.75;
  }
  50% {
    transform: translate(50px, -20px) scale(1.25);
    opacity: 0.85;
  }
  82% {
    opacity: 0.45;
  }
  100% {
    transform: translate(-30px, 40px) scale(0.55);
    opacity: 0;
  }
}

.animate-particle-1 {
  top: 30%;
  left: 25%;
  animation: particle-1 4s ease-in-out infinite;
}

.animate-particle-2 {
  top: 60%;
  left: 70%;
  animation: particle-2 3.5s ease-in-out infinite;
  animation-delay: -1s;
}

.animate-particle-3 {
  top: 45%;
  left: 50%;
  animation: particle-3 3s ease-in-out infinite;
  animation-delay: -2s;
}

.animate-particle-4 {
  top: 25%;
  left: 65%;
  animation: particle-4 4.5s ease-in-out infinite;
  animation-delay: -0.5s;
}

.animate-particle-5 {
  top: 70%;
  left: 35%;
  animation: particle-5 3.8s ease-in-out infinite;
  animation-delay: -1.8s;
}

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
