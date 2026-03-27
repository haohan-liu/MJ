<script setup lang="ts">
import type { Upstream } from '~/composables/useUpstreams'
import type { AvailableUpstream } from '~/composables/useAvailableUpstreams'
import type { ImageModelType, ApiFormat, ImageModelParams } from '../../shared/types'
import { getModelCapabilities, getApiFormatLabel } from '../../shared/registry'
import {
  MAX_REFERENCE_IMAGE_SIZE_BYTES,
  MAX_REFERENCE_IMAGE_COUNT,
  USER_SETTING_KEYS,
} from '../../shared/constants'

const props = defineProps<{
  upstreams: (Upstream | AvailableUpstream)[]
}>()

const emit = defineEmits<{
  submit: [data: {
    prompt: string
    images: string[]
    aimodelId: number
    modelType: ImageModelType
    apiFormat: ApiFormat
    modelName: string
    modelParams: ImageModelParams
  }]
}>()

const toast = useToast()
const { getAuthHeader } = useAuth()
const { formatImageUrl } = useImageUrl()
const { settings, isLoaded: settingsLoaded, loadSettings } = useUserSettings()

const prompt = ref('')
const negativePrompt = ref('')
const referenceImages = ref<string[]>([])
const isSubmitting = ref(false)
const selectedAimodelId = ref<number | null>(null)

// 从 selectedAimodelId 计算 selectedUpstreamId
const selectedUpstreamId = computed(() => {
  if (!selectedAimodelId.value) return null

  for (const upstream of props.upstreams) {
    if (upstream.aimodels?.some(m => m.id === selectedAimodelId.value)) {
      return upstream.id
    }
  }
  return null
})

// 模型参数状态
const size = ref('1024x1024')
const quality = ref<'standard' | 'hd' | 'high' | 'medium' | 'low'>('standard')
const style = ref<'vivid' | 'natural'>('vivid')
const aspectRatio = ref('auto')  // 默认自动
const seed = ref(-1)
const guidanceScale = ref(2.5)
const watermark = ref(false)
const background = ref<'auto' | 'transparent' | 'opaque'>('auto')

// 思考模式和联网搜索
const thinkingMode = ref<'fast' | 'medium' | 'deep'>('fast')
const enableWebSearch = ref(false)
const enableImageSearch = ref(false)

// 尺寸选项
const dalleSizeOptions = [
  { label: '1024x1024 (方形)', value: '1024x1024' },
  { label: '1792x1024 (横版)', value: '1792x1024' },
  { label: '1024x1792 (竖版)', value: '1024x1792' },
]

const doubaoSizeOptions = [
  { label: '1024x1024 (1:1)', value: '1024x1024' },
  { label: '1152x864 (4:3)', value: '1152x864' },
  { label: '864x1152 (3:4)', value: '864x1152' },
  { label: '1280x720 (16:9)', value: '1280x720' },
  { label: '720x1280 (9:16)', value: '720x1280' },
  { label: '1248x832 (3:2)', value: '1248x832' },
  { label: '832x1248 (2:3)', value: '832x1248' },
]

const gptImageSizeOptions = [
  { label: '自动', value: 'auto' },
  { label: '1024x1024 (方形)', value: '1024x1024' },
  { label: '1536x1024 (横版)', value: '1536x1024' },
  { label: '1024x1536 (竖版)', value: '1024x1536' },
]

const geminiSizeOptions = [
  { label: '1K (默认)', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
]

// 质量选项
const dalleQualityOptions = [
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' },
]

const gptImageQualityOptions = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
]

// 风格选项
const styleOptions = [
  { label: '生动 (超现实)', value: 'vivid' },
  { label: '自然', value: 'natural' },
]

// 宽高比选项 - 默认选项
const defaultAspectRatioOptions = [
  { label: '自动', value: 'auto' },
  { label: '1:1 正方形', value: '1:1' },
  { label: '2:3 竖版', value: '2:3' },
  { label: '3:2 横版', value: '3:2' },
  { label: '3:4 竖版', value: '3:4' },
  { label: '4:3 横版', value: '4:3' },
  { label: '4:5 竖版', value: '4:5' },
  { label: '5:4 横版', value: '5:4' },
  { label: '9:16 手机竖屏', value: '9:16' },
  { label: '16:9 宽屏', value: '16:9' },
  { label: '21:9 超宽屏', value: '21:9' },
]

// 背景选项 (GPT Image)
const backgroundOptions = [
  { label: '自动', value: 'auto' },
  { label: '透明', value: 'transparent' },
  { label: '不透明', value: 'opaque' },
]

/**
 * 尺寸标签映射（用于显示）
 */
const sizeLabelMap: Record<string, string> = {
  '512': '512 极速',
  '1K': '1K 标准',
  '2K': '2K 高清',
  '4K': '4K 超清',
  '1024x1024': '1024x1024 (方形)',
  '1792x1024': '1792x1024 (横版)',
  '1024x1792': '1024x1792 (竖版)',
}

/**
 * 宽高比标签映射
 */
const aspectRatioLabelMap: Record<string, string> = {
  'auto': '自动',
  '1:1': '1:1 正方形',
  '2:3': '2:3 竖版',
  '3:2': '3:2 横版',
  '3:4': '3:4 竖版',
  '4:3': '4:3 横版',
  '4:5': '4:5 竖版',
  '5:4': '5:4 横版',
  '9:16': '9:16 手机竖屏',
  '16:9': '16:9 宽屏',
  '21:9': '21:9 超宽屏',
  '1:4': '1:4 极限竖版',
  '4:1': '4:1 极限横版',
  '1:8': '1:8 超长竖版',
  '8:1': '8:1 超长横版',
}

// AI 优化状态
const isOptimizing = ref(false)

// 加载用户设置
onMounted(async () => {
  if (!settingsLoaded.value) {
    await loadSettings()
  }
  
  // 添加全局粘贴事件监听
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  document.removeEventListener('paste', handlePaste)
})

// 监听用户设置和 upstreams 加载完成，设置工作台默认模型
watch([settingsLoaded, () => props.upstreams], ([loaded, upstreams]) => {
  // 如果已经选择了模型，不再自动选择
  if (selectedAimodelId.value) return

  // 使用用户设置的默认模型
  if (loaded) {
    const workbenchAimodelId = settings.value[USER_SETTING_KEYS.DRAWING_WORKBENCH_AIMODEL_ID]
    if (workbenchAimodelId) {
      // 验证模型是否存在于当前 upstreams 中
      for (const upstream of upstreams) {
        if (upstream.aimodels?.some(m => m.id === workbenchAimodelId)) {
          selectedAimodelId.value = workbenchAimodelId as number
          return
        }
      }
    }
  }
}, { immediate: true })

// AI 优化配置是否已设置
const hasAiOptimizeConfig = computed(() => {
  const aimodelId = settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID]
  return !!aimodelId
})

// AI 优化提示词
async function handleOptimize() {
  if (!prompt.value.trim()) {
    toast.add({ title: '请先输入提示词', color: 'warning' })
    return
  }

  if (!hasAiOptimizeConfig.value) {
    toast.add({ title: '请先在设置中配置 AI 优化模型', color: 'warning' })
    return
  }

  isOptimizing.value = true
  try {
    const result = await $fetch<{ success: boolean; optimizedPrompt: string; negativePrompt?: string }>('/api/prompts/optimize', {
      method: 'POST',
      headers: getAuthHeader(),
      body: {
        prompt: prompt.value,
        aimodelId: settings.value[USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID],
        targetModelType: selectedAimodel.value?.modelType,
        targetModelName: selectedAimodel.value?.modelName,
      },
    })

    if (result.success && result.optimizedPrompt) {
      prompt.value = result.optimizedPrompt
      // 如果返回了负面提示词且当前模型支持，则填充
      if (result.negativePrompt && supportsNegativePrompt.value) {
        negativePrompt.value = result.negativePrompt
        toast.add({ title: '提示词已优化', description: '已填充负面提示词', color: 'success' })
      } else {
        toast.add({ title: '提示词已优化', color: 'success' })
      }
    }
  } catch (error: any) {
    toast.add({ title: '优化失败', description: error.data?.message || error.message, color: 'error' })
  } finally {
    isOptimizing.value = false
  }
}

// 模型选择器引用
const modelSelectorRef = ref<{
  selectedUpstream: Upstream | undefined
  selectedAimodel: Aimodel | undefined
} | null>(null)

// 选中的 AI 模型（从 ModelSelector 获取）
const selectedAimodel = computed((): Aimodel | undefined => {
  return modelSelectorRef.value?.selectedAimodel
})

// 是否支持垫图（部分模型不支持）
// 获取当前模型的能力（信任管理员在配置页面设置的 uiCapabilities）
const capabilities = computed(() => {
  if (!selectedAimodel.value) return {}
  // 优先使用模型的 uiCapabilities 配置
  const uiCaps = (selectedAimodel.value as any).uiCapabilities

  // 如果有 uiCapabilities，信任管理员的配置
  if (uiCaps && typeof uiCaps === 'object') {
    return {
      referenceImage: uiCaps.referenceImage ?? false,
      negativePrompt: uiCaps.negativePrompt ?? false,
      size: (uiCaps?.sizes?.length ?? 0) > 0,
      quality: uiCaps.quality ?? false,
      style: uiCaps.style ?? false,
      aspectRatio: (uiCaps?.aspectRatios?.length ?? 0) > 0,
      seed: uiCaps.seed ?? false,
      guidance: uiCaps.guidance ?? false,
      watermark: uiCaps.watermark ?? false,
      background: uiCaps.background ?? false,
    }
  }

  // 如果没有 uiCapabilities，回退到默认推断
  const defaultCaps = getModelCapabilities(selectedAimodel.value.modelType as ImageModelType)

  // NanoBanana 模型默认关闭负面提示词（官方不支持）
  if (isNanoBananaModel.value) {
    return {
      ...defaultCaps,
      referenceImage: true,
      negativePrompt: false,  // Google 模型官方不支持负面提示词
      aspectRatio: true,
    }
  }

  return defaultCaps
})

const supportsReferenceImages = computed(() => {
  if (!selectedAimodel.value?.apiFormat) return false
  return capabilities.value.referenceImage === true
})

// 是否支持负面提示词（NanoBanana 模型强制不支持）
const supportsNegativePrompt = computed(() => {
  // NanoBanana 模型官方不支持负面提示词
  if (isNanoBananaModel.value) {
    return false
  }
  return capabilities.value.negativePrompt === true
})

// 模型类型判断
const isDalleModel = computed(() => selectedAimodel.value?.modelType === 'dalle')
const isDoubaoModel = computed(() => selectedAimodel.value?.modelType === 'doubao')
const isFluxModel = computed(() => selectedAimodel.value?.modelType === 'flux')
const isGpt4oImageModel = computed(() => selectedAimodel.value?.modelType === 'gpt4o-image')
const isGeminiModel = computed(() => ['gemini', 'banana'].includes(selectedAimodel.value?.modelType || ''))

// NanoBanana 模型判断（支持模型类型和模型名称识别）
const isNanoBananaModel = computed(() => {
  const modelType = selectedAimodel.value?.modelType || ''
  // 1. 先按模型类型判断
  if (['nanobanana', 'nanobanana-pro', 'nanobanana-2'].includes(modelType)) {
    return true
  }
  // 2. 按模型名称关键字判断
  const modelName = selectedAimodel.value?.modelName?.toLowerCase() || ''
  return modelName.includes('nanobanana') ||
         modelName.includes('gemini-2.5') ||
         modelName.includes('gemini-3-pro') ||
         modelName.includes('gemini-3.1')
})

// 是否支持各参数
const supportsSize = computed(() => capabilities.value.size === true)

const supportsQuality = computed(() => capabilities.value.quality === true)

const supportsStyle = computed(() => capabilities.value.style === true)

const supportsAspectRatio = computed(() => capabilities.value.aspectRatio === true)

const supportsSeed = computed(() => capabilities.value.seed === true)

const supportsGuidance = computed(() => capabilities.value.guidance === true)

const supportsWatermark = computed(() => capabilities.value.watermark === true)

const supportsBackground = computed(() => capabilities.value.background === true)

// 是否支持思考模式（信任管理员的 uiCapabilities 配置）
const supportsThinkingMode = computed(() => {
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  // 优先检查 thinkingModesEnabled（布尔值）
  if (uiCaps?.thinkingModesEnabled !== undefined) {
    return uiCaps.thinkingModesEnabled === true
  }
  // 回退检查 thinkingModes（数组）
  if (uiCaps?.thinkingModes !== undefined) {
    return (uiCaps.thinkingModes?.length ?? 0) > 0
  }
  return false
})

// 思考模式选项（信任管理员的 uiCapabilities 配置）
const thinkingModeOptions = computed(() => {
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.thinkingModes && uiCaps.thinkingModes.length > 0) {
    return uiCaps.thinkingModes.map((m: string) => ({
      label: m === 'fast' ? '快速思考' : m === 'medium' ? '中等' : m === 'deep' ? '深度思考' : m,
      value: m
    }))
  }
  // 如果启用了 thinkingModesEnabled 但没有具体选项，提供默认选项
  if (uiCaps?.thinkingModesEnabled === true) {
    return [
      { label: '快速思考', value: 'fast' },
      { label: '深度思考', value: 'deep' },
    ]
  }
  return []
})

// 是否支持 Google 搜索（信任管理员的 uiCapabilities 配置）
const supportsWebSearch = computed(() => {
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.webSearch !== undefined) {
    return uiCaps.webSearch === true
  }
  return false
})

// 是否支持图片搜索（信任管理员的 uiCapabilities 配置）
const supportsImageSearch = computed(() => {
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.imageSearch !== undefined) {
    return uiCaps.imageSearch === true
  }
  return false
})

// 获取当前模型的尺寸选项（信任管理员的 uiCapabilities 配置）
const currentSizeOptions = computed(() => {
  // 优先使用模型自定义的尺寸配置（管理员配置的 uiCapabilities）
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.sizes?.length > 0) {
    return uiCaps.sizes.map((s: string) => ({
      label: sizeLabelMap[s] || s,
      value: s
    }))
  }

  // 回退到模型类型默认选项
  if (isDalleModel.value) return dalleSizeOptions
  if (isDoubaoModel.value) return doubaoSizeOptions
  if (isGpt4oImageModel.value) return gptImageSizeOptions
  if (isGeminiModel.value) return geminiSizeOptions
  return dalleSizeOptions
})

// 获取当前模型的宽高比选项（信任管理员的 uiCapabilities 配置）
const currentAspectRatioOptions = computed(() => {
  // 优先使用模型自定义的宽高比配置（管理员配置的 uiCapabilities）
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.aspectRatios?.length > 0) {
    return uiCaps.aspectRatios.map((r: string) => ({
      label: aspectRatioLabelMap[r] || r,
      value: r
    }))
  }

  return defaultAspectRatioOptions
})

// 监听模型变化，当切换模型时重置可能不适用的参数
watch([() => selectedAimodel.value?.modelType, () => selectedAimodel.value?.id],
  () => {
    // 重置所有可能残留的参数到默认值
    negativePrompt.value = ''
    seed.value = -1
    guidanceScale.value = 2.5
    watermark.value = false
    background.value = 'auto'
    enableWebSearch.value = false
    enableImageSearch.value = false
    thinkingMode.value = 'fast'

    // 尺寸和宽高比会在 watch currentSizeOptions/currentAspectRatioOptions 中自动调整
  }, { immediate: true })

// 监听尺寸选项变化，自动选择第一个有效选项
watch([currentSizeOptions, () => selectedAimodel.value?.id], () => {
  if (!selectedAimodel.value || !supportsSize.value) return
  const options = currentSizeOptions.value
  if (!options.length) return
  // 检查当前尺寸是否在选项中，不在则使用第一个选项
  if (!options.some(option => option.value === size.value)) {
    size.value = options[0].value
  }
}, { immediate: true })

// 监听宽高比选项变化，自动选择第一个有效选项
watch(currentAspectRatioOptions, (options) => {
  if (!selectedAimodel.value || !supportsAspectRatio.value) return
  if (!options.length) return
  // 检查当前宽高比是否在选项中，不在则使用第一个选项
  if (!options.some(option => option.value === aspectRatio.value)) {
    aspectRatio.value = options[0].value
  }
}, { immediate: true })

// 获取当前模型的质量选项
const currentQualityOptions = computed(() => {
  if (isGpt4oImageModel.value) return gptImageQualityOptions
  return dalleQualityOptions
})

// 模型信息模态框状态
const showModelInfoModal = ref(false)

// 上传中状态
const isUploading = ref(false)

// 拖拽状态
const isDragging = ref(false)

// 处理图片上传（统一处理函数）
async function uploadFiles(files: File[]) {
  const validFiles = files.slice(0, MAX_REFERENCE_IMAGE_COUNT - referenceImages.value.length)

  for (const file of validFiles) {
    if (!file.type.startsWith('image/')) {
      toast.add({ title: '只能上传图片文件', color: 'error' })
      continue
    }
    if (file.size > MAX_REFERENCE_IMAGE_SIZE_BYTES) {
      toast.add({ title: '图片大小不能超过30MB', color: 'error' })
      continue
    }

    isUploading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await $fetch<{ success: boolean; url: string }>('/api/images/upload', {
        method: 'POST',
        body: formData,
      })

      if (result.success && referenceImages.value.length < MAX_REFERENCE_IMAGE_COUNT) {
        referenceImages.value.push(result.url)
      }
    } catch (error: any) {
      toast.add({ title: '图片上传失败', description: error.message, color: 'error' })
    } finally {
      isUploading.value = false
    }
  }
}

// 处理文件选择
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  await uploadFiles(Array.from(input.files))
  input.value = ''
}

// 处理拖拽
function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false

  const files = event.dataTransfer?.files
  if (files?.length) {
    await uploadFiles(Array.from(files))
  }
}

// 全局拖拽处理（全屏遮罩）
function handleGlobalDragOver(event: DragEvent) {
  event.preventDefault()
  // 检查是否拖拽的是文件
  if (event.dataTransfer?.types.includes('Files')) {
    isGlobalDragging.value = true
  }
}

function handleGlobalDragLeave(event: DragEvent) {
  event.preventDefault()
  // 只有当离开整个文档时才关闭遮罩
  if (event.relatedTarget === null) {
    isGlobalDragging.value = false
  }
}

async function handleGlobalDrop(event: DragEvent) {
  event.preventDefault()
  isGlobalDragging.value = false

  const files = event.dataTransfer?.files
  if (files?.length) {
    await uploadFiles(Array.from(files))
  }
}

// 处理粘贴
async function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return

  const imageFiles: File[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }

  if (imageFiles.length > 0) {
    await uploadFiles(imageFiles)
  }
}

// 移除参考图
function removeImage(index: number) {
  referenceImages.value.splice(index, 1)
}

// 提交生成
async function handleSubmit() {
  if (!prompt.value.trim() && referenceImages.value.length === 0) {
    return
  }

  if (!selectedUpstreamId.value || selectedAimodelId.value === null || !selectedAimodel.value) {
    toast.add({ title: '请先选择模型配置', color: 'warning' })
    return
  }

  if (!supportsReferenceImages.value && referenceImages.value.length > 0 && !prompt.value.trim()) {
    toast.add({ title: '当前模型需要输入提示词', color: 'warning' })
    return
  }

  isSubmitting.value = true
  try {
    const imagesToSubmit = supportsReferenceImages.value ? referenceImages.value : []

    // 构建 modelParams
    const modelParams: ImageModelParams = {}

    // 负面提示词
    if (supportsNegativePrompt.value && negativePrompt.value) {
      modelParams.negativePrompt = negativePrompt.value
    }

    // 尺寸
    if (supportsSize.value && size.value) {
      modelParams.size = size.value
    }

    // 质量
    if (supportsQuality.value && quality.value) {
      modelParams.quality = quality.value
    }

    // 风格 (DALL-E 3)
    if (supportsStyle.value && style.value) {
      modelParams.style = style.value
    }

    // 宽高比 (Flux) - 'auto' 时不传递，让 AI 自动判断
    if (supportsAspectRatio.value && aspectRatio.value && aspectRatio.value !== 'auto') {
      modelParams.aspectRatio = aspectRatio.value
    }

    // 随机种子 (豆包)
    if (supportsSeed.value && seed.value !== -1) {
      modelParams.seed = seed.value
    }

    // 提示词相关度 (豆包)
    if (supportsGuidance.value) {
      modelParams.guidanceScale = guidanceScale.value
    }

    // 水印 (豆包)
    if (supportsWatermark.value) {
      modelParams.watermark = watermark.value
    }

    // 背景透明度 (GPT Image)
    if (supportsBackground.value && background.value !== 'auto') {
      modelParams.background = background.value
    }

    // 思考模式 (Gemini)
    if (supportsThinkingMode.value && thinkingMode.value) {
      modelParams.thinkingMode = thinkingMode.value
    }

    // 联网搜索 (Gemini)
    if (supportsWebSearch.value && enableWebSearch.value) {
      modelParams.webSearch = enableWebSearch.value
    }

    // 图片搜索 (Gemini)
    if (supportsImageSearch.value && enableImageSearch.value) {
      modelParams.imageSearch = enableImageSearch.value
    }

    emit('submit', {
      prompt: prompt.value,
      images: imagesToSubmit,
      aimodelId: selectedAimodelId.value!,
      modelType: selectedAimodel.value.modelType as ImageModelType,
      apiFormat: selectedAimodel.value.apiFormat,
      modelName: selectedAimodel.value.modelName,
      modelParams,
    })
  } finally {
    isSubmitting.value = false
  }
}

// 设置面板内容（供外部调用）
function setContent(newPrompt: string | null, modelParams: ImageModelParams | null, images: string[]) {
  prompt.value = newPrompt || ''
  negativePrompt.value = modelParams?.negativePrompt || ''
  referenceImages.value = images.slice(0, MAX_REFERENCE_IMAGE_COUNT)

  // 恢复模型参数
  if (modelParams) {
    if (modelParams.size) size.value = modelParams.size
    if (modelParams.quality) quality.value = modelParams.quality
    if (modelParams.style) style.value = modelParams.style
    if (modelParams.aspectRatio) aspectRatio.value = modelParams.aspectRatio
    if (modelParams.seed !== undefined) seed.value = modelParams.seed
    if (modelParams.guidanceScale !== undefined) guidanceScale.value = modelParams.guidanceScale
    if (modelParams.watermark !== undefined) watermark.value = modelParams.watermark
    if (modelParams.background) background.value = modelParams.background
  }
}


// 全局拖拽状态
const isGlobalDragging = ref(false)

// 暴露给父组件
defineExpose({
  setContent,
})
</script>

<template>
  <div 
    class="space-y-4 relative"
    @dragover="handleGlobalDragOver"
    @dragleave="handleGlobalDragLeave"
    @drop="handleGlobalDrop"
  >
    <!-- 全屏拖拽遮罩 -->
    <Teleport to="body">
      <Transition name="fade">
        <div 
          v-if="isGlobalDragging"
          class="fixed inset-0 z-50 bg-(--ui-bg)/90 backdrop-blur-sm flex items-center justify-center"
          @drop.prevent="handleGlobalDrop"
          @dragover.prevent
        >
          <div class="text-center">
            <UIcon name="i-heroicons-cloud-arrow-up" class="w-20 h-20 text-(--ui-primary) mx-auto mb-4 animate-bounce" />
            <p class="text-xl font-medium text-(--ui-text)">松开即可上传图片</p>
            <p class="text-sm text-(--ui-text-muted) mt-2">支持常见图片格式，单张最大30MB</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 上传/压缩遮罩 -->
    <Teleport to="body">
      <Transition name="fade">
        <div 
          v-if="isUploading"
          class="fixed inset-0 z-50 bg-(--ui-bg)/80 backdrop-blur-sm flex items-center justify-center"
        >
          <div class="text-center bg-(--ui-bg-elevated) rounded-xl p-8 shadow-2xl">
            <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-(--ui-primary) mx-auto mb-4 animate-spin" />
            <p class="text-lg font-medium text-(--ui-text)">正在处理图片...</p>
            <p class="text-sm text-(--ui-text-muted) mt-2">请勿关闭此窗口</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 模型选择 -->
    <UFormField label="选择模型">
        <template #label>
          <span class="inline-flex items-center gap-1.5">
            选择模型
            <button
              v-if="selectedAimodel"
              type="button"
              class="inline-flex items-center text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
              @click="showModelInfoModal = true"
            >
              <UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5" />
            </button>
          </span>
        </template>
        <ModelSelector
          ref="modelSelectorRef"
          :upstreams="upstreams"
          category="image"
          v-model:aimodel-id="selectedAimodelId"
          no-auto-select
        />
      </UFormField>

    <!-- 模型信息模态框 -->
    <UModal v-model:open="showModelInfoModal" title="模型信息">
      <template #body>
        <div v-if="selectedAimodel" class="space-y-3">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-(--ui-text-muted)">请求格式：</span>
            <span class="text-(--ui-text)">{{ getApiFormatLabel(selectedAimodel.apiFormat) }}</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-(--ui-text-muted)">模型名称：</span>
            <span class="text-(--ui-text) font-mono">{{ selectedAimodel.modelName }}</span>
          </div>
        </div>
        <p v-else class="text-(--ui-text-muted) text-sm">请先选择一个模型</p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="showModelInfoModal = false">关闭</UButton>
      </template>
    </UModal>

    <!-- 分隔线 -->
    <div class="border-t border-(--ui-border)" />

    <!-- 参考图上传区 -->
    <UFormField v-if="supportsReferenceImages" label="参考图 (可选)">
      <template #hint>
        <span class="text-(--ui-text-dimmed) text-xs">支持常见图片格式，单张最大30MB，最多{{ MAX_REFERENCE_IMAGE_COUNT }}张</span>
      </template>

      <div class="flex gap-3 flex-wrap">
        <!-- 已上传的图片 -->
        <div
          v-for="(img, index) in referenceImages"
          :key="index"
          class="relative w-24 h-24 rounded-lg overflow-hidden group"
        >
          <img :src="formatImageUrl(img)" class="w-full h-full object-cover" />
          <button
            type="button"
            class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            @click="removeImage(index)"
          >
            <UIcon name="i-heroicons-x-mark" class="w-6 h-6 text-white" />
          </button>
        </div>

        <!-- 上传区域（支持拖拽和粘贴） -->
        <div
          v-if="referenceImages.length < MAX_REFERENCE_IMAGE_COUNT"
          class="w-full min-h-[100px] rounded-lg border-2 border-dashed transition-colors flex flex-col items-center justify-center cursor-pointer relative"
          :class="isDragging ? 'border-(--ui-primary) bg-(--ui-primary)/10' : 'border-(--ui-border-accented) hover:border-(--ui-primary)'"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          @click="($refs.fileInput as HTMLInputElement).click()"
        >
          <UIcon name="i-heroicons-cloud-arrow-up" class="w-8 h-8 text-(--ui-text-dimmed) mb-2" />
          <span class="text-(--ui-text-dimmed) text-sm">点击上传、粘贴或拖拽图片到工作台</span>
          <span v-if="isDragging" class="text-(--ui-primary) text-xs mt-1">松开即可上传</span>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            @change="handleFileChange"
          />
        </div>
      </div>
    </UFormField>

    <!-- 提示词输入 -->
    <UFormField label="描述你想要的图片">
      <template #label>
        <span class="inline-flex items-center gap-2">
          描述你想要的图片
          <UButton
            v-if="hasAiOptimizeConfig"
            size="xs"
            variant="soft"
            :loading="isOptimizing"
            :disabled="!prompt.trim()"
            @click="handleOptimize"
          >
            <UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5 mr-1" />
            AI 优化
          </UButton>
        </span>
      </template>
      <UTextarea
        v-model="prompt"
        placeholder="例如：一只可爱的小猫咪坐在花园里，油画风格，高清，细节丰富"
        :rows="8"
        class="w-full"
      />
    </UFormField>

    <!-- 高级选项（直接显示） -->
    <div v-if="selectedAimodel" class="space-y-4 pt-4">

          <!-- 负面提示词输入（仅支持的模型显示） -->
          <UFormField v-if="supportsNegativePrompt" label="负面提示词">
            <template #hint>
              <span class="text-(--ui-text-dimmed) text-xs">描述不希望出现的内容</span>
            </template>
            <UTextarea
              v-model="negativePrompt"
              placeholder="例如：模糊、低质量、变形、水印"
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <!-- 尺寸选择 -->
          <UFormField v-if="supportsSize" label="尺寸">
            <USelect
              v-model="size"
              :items="currentSizeOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 思考模式选择 -->
          <UFormField v-if="supportsThinkingMode" label="思考模式">
            <URadioGroup
              v-model="thinkingMode"
              :items="thinkingModeOptions"
              class="flex gap-4"
            />
          </UFormField>

          <!-- Google 搜索开关 -->
          <UFormField v-if="supportsWebSearch" label="联网搜索">
            <template #hint>
              <span class="text-(--ui-text-dimmed) text-xs">启用 Google 搜索获取实时信息</span>
            </template>
            <USwitch v-model="enableWebSearch" />
          </UFormField>

          <!-- 图片搜索开关 -->
          <UFormField v-if="supportsImageSearch" label="图片搜索">
            <template #hint>
              <span class="text-(--ui-text-dimmed) text-xs">启用图片搜索获取参考图片</span>
            </template>
            <USwitch v-model="enableImageSearch" />
          </UFormField>

          <!-- 宽高比选择 (Flux/Gemini) -->
          <UFormField v-if="supportsAspectRatio" label="宽高比">
            <USelect
              v-model="aspectRatio"
              :items="currentAspectRatioOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 质量选择 -->
          <UFormField v-if="supportsQuality" label="质量">
            <USelect
              v-model="quality"
              :items="currentQualityOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 风格选择 (DALL-E 3) -->
          <UFormField v-if="supportsStyle" label="风格">
            <USelect
              v-model="style"
              :items="styleOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 背景透明度 (GPT Image) -->
          <UFormField v-if="supportsBackground" label="背景">
            <USelect
              v-model="background"
              :items="backgroundOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <!-- 提示词相关度 (豆包) -->
          <UFormField v-if="supportsGuidance" label="提示词相关度">
            <template #hint>
              <span class="text-(--ui-text-dimmed) text-xs">值越大与提示词相关性越强 (1-10)</span>
            </template>
            <UInput
              v-model.number="guidanceScale"
              type="number"
              :min="1"
              :max="10"
              :step="0.5"
              class="w-full"
            />
          </UFormField>

          <!-- 随机种子 (豆包) -->
          <UFormField v-if="supportsSeed" label="随机种子">
            <template #hint>
              <span class="text-(--ui-text-dimmed) text-xs">-1 表示自动生成</span>
            </template>
            <UInput
              v-model.number="seed"
              type="number"
              :min="-1"
              :max="2147483647"
              class="w-full"
            />
          </UFormField>

          <!-- 水印开关 (豆包) -->
          <div v-if="supportsWatermark" class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-sm text-(--ui-text)">添加水印</span>
              <span class="text-xs text-(--ui-text-dimmed)">在图片右下角添加"AI生成"水印</span>
            </div>
            <USwitch v-model="watermark" />
          </div>
    </div>

    <!-- 提交按钮 -->
    <UButton
      block
      size="lg"
      :loading="isSubmitting"
      :disabled="(!prompt.trim() && referenceImages.length === 0) || selectedAimodelId === null || upstreams.length === 0"
      class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
      @click="handleSubmit"
    >
      <UIcon name="i-heroicons-sparkles" class="w-5 h-5 mr-2" />
      开始生成
    </UButton>
  </div>
</template>
