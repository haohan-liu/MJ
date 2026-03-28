<script setup lang="ts">
import type { VideoModelType, ApiFormat, ImageModelParams, ModelParams } from '~/shared/types'

definePageMeta({
  middleware: 'auth',
})

const { loadTasks, tasks, total } = useTasks()
const { upstreams } = useAvailableUpstreams()
const toast = useToast()

// StudioWorkbench 组件引用
const workbenchRef = ref<{ setContent: (prompt: string | null, modelParams: ImageModelParams | null, images: string[]) => void } | null>(null)

// 页面加载时获取任务列表
onMounted(() => {
  loadTasks()
})

// 提交图片任务
async function handleImageSubmit(data: {
  prompt: string
  images: string[]
  aimodelId: number
  modelType: string
  apiFormat: string
  modelName: string
  modelParams: ImageModelParams
}) {
  try {
    const result = await $fetch<{ success: boolean; taskId: number; message: string }>('/api/tasks', {
      method: 'POST',
      body: {
        taskType: 'image',
        prompt: data.prompt,
        modelParams: data.modelParams,
        images: data.images,
        type: data.apiFormat === 'mj-proxy' && data.images.length > 0 && !data.prompt ? 'blend' : 'imagine',
        aimodelId: data.aimodelId,
        modelType: data.modelType,
        apiFormat: data.apiFormat,
        modelName: data.modelName,
      },
    })

    if (result.success) {
      // 主要依赖 SSE task.created 事件更新列表，但同时做一次兜底拉取确保任务显示
      $fetch<any>(`/api/tasks/${result.taskId}`).then(fullTask => {
        if (!tasks.value.some(t => t.id === fullTask.id)) {
          tasks.value.unshift(fullTask)
          total.value += 1
        }
      }).catch(() => {})
      toast.add({
        title: '任务已创建',
        description: result.message,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({
      title: '提交失败',
      description: error.data?.message || error.message || '请稍后重试',
      color: 'error',
    })
  }
}

// 提交视频任务
async function handleVideoSubmit(data: {
  prompt: string
  images: string[]
  aimodelId: number
  modelType: VideoModelType
  apiFormat: ApiFormat
  modelName: string
  modelParams: ModelParams
}) {
  try {
    const result = await $fetch<{ success: boolean; taskId: number; message: string }>('/api/tasks', {
      method: 'POST',
      body: {
        taskType: 'video',
        prompt: data.prompt,
        modelParams: data.modelParams,
        images: data.images,
        aimodelId: data.aimodelId,
        modelType: data.modelType,
        apiFormat: data.apiFormat,
        modelName: data.modelName,
      },
    })

    if (result.success) {
      // 主要依赖 SSE task.created 事件更新列表，但同时做一次兜底拉取确保任务显示
      $fetch<any>(`/api/tasks/${result.taskId}`).then(fullTask => {
        if (!tasks.value.some(t => t.id === fullTask.id)) {
          tasks.value.unshift(fullTask)
          total.value += 1
        }
      }).catch(() => {})
      toast.add({
        title: '视频任务已创建',
        description: result.message,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({
      title: '提交失败',
      description: error.data?.message || error.message || '请稍后重试',
      color: 'error',
    })
  }
}

// 复制任务内容到工作台
function handleCopyToPanel(prompt: string | null, modelParams: ImageModelParams | null, images: string[]) {
  workbenchRef.value?.setContent(prompt, modelParams, images)
  toast.add({
    title: '已复制到工作台',
    color: 'success',
  })
}
</script>

<template>
  <div class="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden min-h-0">
    <!-- 公告栏：限制最大高度，多条时在区域内滚动，避免挤压左侧参数区 -->
    <div
      class="flex-shrink-0 border-b border-(--ui-border) bg-(--ui-bg) px-3 py-2 max-h-[min(30vh,12.5rem)] overflow-y-auto overscroll-y-contain"
    >
      <AnnouncementBanner :max-items="5" compact />
    </div>

    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col min-h-0 overflow-y-auto lg:flex-row lg:gap-6 lg:overflow-hidden">
      <!-- 工作台面板：略加宽 + 内边距，减轻 100% 缩放下的拥挤感 -->
      <div
        class="flex-shrink-0 border-b lg:border-b-0 lg:border-r border-(--ui-border) bg-(--ui-bg-elevated) p-4 sm:p-5 lg:min-h-0 lg:max-h-full lg:overflow-y-auto lg:w-[min(392px,36vw)] lg:max-w-[420px]"
      >
        <StudioWorkbench ref="workbenchRef" :upstreams="upstreams" @submit-image="handleImageSubmit" @submit-video="handleVideoSubmit" />
      </div>

      <!-- 任务列表 -->
      <div class="flex-1 min-w-0 min-h-0 p-4 sm:p-5 lg:overflow-y-auto">
        <StudioList @copy-to-panel="handleCopyToPanel" />
      </div>
    </div>
  </div>
</template>
