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

// ============================================================
// NanoBanana 模型独立配置（严格基于 Google 官方文档限制）
// ============================================================

/**
 * NanoBanana 模型能力定义
 * 严格对应 Google 官方文档，不携带任何多余参数
 */
interface NanoBananaModelCapabilities {
  /** 底层模型名称 */
  modelName: string
  /** 模型类型标识 */
  modelType: 'nanobanana' | 'nanobanana-pro' | 'nanobanana-2'
  /** 显示名称 */
  displayName: string
  /** 默认宽高比 */
  defaultAspectRatio: string
  /** 尺寸选项（界面展示值） */
  sizeOptions: { label: string; value: string }[]
  /** 支持的宽高比列表 */
  supportedAspectRatios: string[]
  /** 是否支持联网搜索 (Google Search) */
  supportsWebSearch: boolean
  /** 是否支持图片搜索 (Image Search) */
  supportsImageSearch: boolean
  /** 是否支持思考模式 (Thinking) */
  supportsThinking: boolean
  /** 默认思考模式 */
  defaultThinkingMode?: 'fast' | 'medium' | 'deep'
}

/**
 * NanoBanana 模型配置表
 * 严格遵循 Google 官方文档：
 * - gemini-2.5-flash-image: 基础模型，无搜索/思考
 * - gemini-3-pro-image-preview: Pro 模型，仅支持联网搜索
 * - gemini-3.1-flash-image-preview: 2 代模型，全功能支持
 */
const nanoBananaModelCapabilities: Record<string, NanoBananaModelCapabilities> = {
  // NanoBanana: gemini-2.5-flash-image
  // 官方限制：仅支持基础尺寸 1K，无搜索/思考功能
  'nanobanana': {
    modelName: 'gemini-2.5-flash-image',
    modelType: 'nanobanana',
    displayName: 'NanoBanana',
    defaultAspectRatio: '1:1',
    sizeOptions: [
      { label: '1K 标准', value: '1K' },
    ],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    supportsWebSearch: false,   // 官方明确不支持
    supportsImageSearch: false, // 官方明确不支持
    supportsThinking: false,     // 官方明确不支持
  },
  // NanoBanana Pro: gemini-3-pro-image-preview
  // 官方限制：支持 1K/2K/4K，仅支持联网搜索，无图片搜索/思考
  'nanobanana-pro': {
    modelName: 'gemini-3-pro-image-preview',
    modelType: 'nanobanana-pro',
    displayName: 'NanoBanana Pro',
    defaultAspectRatio: '1:1',
    sizeOptions: [
      { label: '1K 标准', value: '1K' },
      { label: '2K 高清', value: '2K' },
      { label: '4K 超清', value: '4K' },
    ],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    supportsWebSearch: true,    // 支持联网搜索
    supportsImageSearch: false, // 不支持图片搜索
    supportsThinking: false,    // 不支持思考模式
  },
  // NanoBanana 2: gemini-3.1-flash-image-preview
  // 官方限制：全功能支持，包含极端宽高比 (1:4, 4:1, 1:8, 8:1) 和全分辨率
  'nanobanana-2': {
    modelName: 'gemini-3.1-flash-image-preview',
    modelType: 'nanobanana-2',
    displayName: 'NanoBanana 2',
    defaultAspectRatio: '1:1',
    sizeOptions: [
      { label: '512 极速', value: '512' },
      { label: '1K 标准', value: '1K' },
      { label: '2K 高清', value: '2K' },
      { label: '4K 超清', value: '4K' },
    ],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:4', '4:1', '1:8', '8:1'],
    supportsWebSearch: true,    // 支持联网搜索
    supportsImageSearch: true,   // 支持图片搜索
    supportsThinking: true,     // 支持思考模式
    defaultThinkingMode: 'fast',
  },
}

/**
 * 获取当前 NanoBanana 模型能力配置
 */
const currentNanoBananaCapabilities = computed(() => {
  if (!isNanoBananaModel.value) return null
  const modelType = selectedAimodel.value?.modelType
  return modelType ? nanoBananaModelCapabilities[modelType] || null : null
})

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
// 获取当前模型的能力（优先使用模型自定义配置）
const capabilities = computed(() => {
  if (!selectedAimodel.value) return {}
  // 优先使用模型的 uiCapabilities 配置
  const uiCaps = (selectedAimodel.value as any).uiCapabilities
  if (uiCaps && Object.keys(uiCaps).length > 0) {
    return {
      referenceImage: uiCaps.referenceImage ?? false,
      negativePrompt: uiCaps.negativePrompt ?? false,
      size: (uiCaps?.sizes?.length ?? 0) > 0,
      quality: uiCaps.quality ?? false,
      style: uiCaps.style ?? false,
      aspectRatio: uiCaps.aspectRatios?.length > 0 ?? false,
      seed: uiCaps.seed ?? false,
      guidance: uiCaps.guidance ?? false,
      watermark: uiCaps.watermark ?? false,
      background: uiCaps.background ?? false,
    }
  }
  // 回退到默认能力推断
  const defaultCaps = getModelCapabilities(selectedAimodel.value.modelType as ImageModelType)
  // 如果是 NanoBanana 模型，强制启用这些 UI 能力
  if (isNanoBananaModel.value) {
    return {
      ...defaultCaps,
      referenceImage: true,
      negativePrompt: true,
      size: true,
      quality: true,
      aspectRatio: true,
    }
  }
  return defaultCaps
})

const supportsReferenceImages = computed(() => {
  if (!selectedAimodel.value?.apiFormat) return false
  return capabilities.value.referenceImage === true
})

// 是否支持负面提示词
const supportsNegativePrompt = computed(() => {
  return capabilities.value.negativePrompt === true
})

// 模型类型判断
const isDalleModel = computed(() => selectedAimodel.value?.modelType === 'dalle')
const isDoubaoModel = computed(() => selectedAimodel.value?.modelType === 'doubao')
const isFluxModel = computed(() => selectedAimodel.value?.modelType === 'flux')
const isGpt4oImageModel = computed(() => selectedAimodel.value?.modelType === 'gpt4o-image')
const isGeminiModel = computed(() => ['gemini', 'banana'].includes(selectedAimodel.value?.modelType || ''))

// NanoBanana 模型判断 - 这些模型需要强制启用宽高比、尺寸、参考图、联网搜索等 UI 能力
const isNanoBananaModel = computed(() => {
  const modelType = selectedAimodel.value?.modelType || ''
  return ['nanobanana', 'nanobanana-pro', 'nanobanana-2'].includes(modelType)
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

// 是否支持思考模式（严格按模型能力）
const supportsThinkingMode = computed(() => {
  // NanoBanana 模型严格按配置返回
  if (isNanoBananaModel.value) {
    const caps = currentNanoBananaCapabilities.value
    return caps?.supportsThinking ?? false
  }
  // 其他模型检查 uiCapabilities
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  return uiCaps?.thinkingModes?.length > 0 ?? false
})

// 思考模式选项（NanoBanana 模型使用内置选项，其他模型使用 uiCapabilities）
const thinkingModeOptions = computed(() => {
  // NanoBanana 模型使用内置选项
  if (isNanoBananaModel.value) {
    const caps = currentNanoBananaCapabilities.value
    if (caps?.supportsThinking) {
      return [
        { label: '快速（默认）', value: 'fast' },
        { label: '深度思考', value: 'deep' },
      ]
    }
    return []
  }
  // 其他模型使用 uiCapabilities
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (!uiCaps?.thinkingModes) return []
  return uiCaps.thinkingModes.map((m: string) => ({
    label: m === 'fast' ? '快速' : m === 'medium' ? '中等' : m === 'deep' ? '深度思考' : m,
    value: m
  }))
})

// 是否支持 Google 搜索（严格按模型能力）
const supportsWebSearch = computed(() => {
  // NanoBanana 模型严格按配置返回
  if (isNanoBananaModel.value) {
    const caps = currentNanoBananaCapabilities.value
    return caps?.supportsWebSearch ?? false
  }
  // 其他模型检查 uiCapabilities
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.webSearch !== undefined) {
    return uiCaps.webSearch === true
  }
  return false
})

// 是否支持图片搜索（严格按模型能力）
const supportsImageSearch = computed(() => {
  // NanoBanana 模型严格按配置返回
  if (isNanoBananaModel.value) {
    const caps = currentNanoBananaCapabilities.value
    return caps?.supportsImageSearch ?? false
  }
  // 其他模型检查 uiCapabilities
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.imageSearch !== undefined) {
    return uiCaps.imageSearch === true
  }
  return false
})

// 获取当前模型的尺寸选项（NanoBanana 严格按配置，其他模型使用 uiCapabilities 或默认）
const currentSizeOptions = computed(() => {
  // NanoBanana 模型：严格使用专属配置
  if (isNanoBananaModel.value && currentNanoBananaCapabilities.value) {
    return currentNanoBananaCapabilities.value.sizeOptions
  }

  // 优先使用模型自定义的尺寸配置
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.sizes?.length > 0) {
    return uiCaps.sizes.map((s: string) => ({
      label: sizeLabelMap[s] || s,
      value: s
    }))
  }

  // 回退到默认选项
  if (isDalleModel.value) return dalleSizeOptions
  if (isDoubaoModel.value) return doubaoSizeOptions
  if (isGpt4oImageModel.value) return gptImageSizeOptions
  if (isGeminiModel.value) return geminiSizeOptions
  return dalleSizeOptions
})

// 获取当前模型的宽高比选项（NanoBanana 严格按配置，其他模型使用 uiCapabilities 或默认）
const currentAspectRatioOptions = computed(() => {
  // NanoBanana 模型：严格使用专属配置
  if (isNanoBananaModel.value && currentNanoBananaCapabilities.value) {
    return currentNanoBananaCapabilities.value.supportedAspectRatios.map(r => ({
      label: aspectRatioLabelMap[r] || r,
      value: r
    }))
  }

  // 优先使用模型自定义的宽高比配置
  const uiCaps = (selectedAimodel.value as any)?.uiCapabilities
  if (uiCaps?.aspectRatios?.length > 0) {
    return uiCaps.aspectRatios.map((r: string) => ({
      label: aspectRatioLabelMap[r] || r,
      value: r
    }))
  }

  return defaultAspectRatioOptions
})

// 监听 NanoBanana 模型变化，加载专属能力配置
watch(() => selectedAimodel.value?.modelType, (newModelType, oldModelType) => {
  // 非 NanoBanana 模型，不处理
  if (!newModelType || !['nanobanana', 'nanobanana-pro', 'nanobanana-2'].includes(newModelType)) return

  // 模型切换时，严格按该模型的能力配置重置参数
  if (newModelType !== oldModelType) {
    const caps = nanoBananaModelCapabilities[newModelType]
    if (caps) {
      // 设置该模型专属的尺寸选项（强制使用第一个）
      size.value = caps.sizeOptions[0]?.value || '1K'
      // 设置该模型专属的宽高比
      aspectRatio.value = caps.defaultAspectRatio
      // 重置搜索开关（严格按模型能力）
      enableWebSearch.value = false
      enableImageSearch.value = false
      // 设置思考模式默认值
      thinkingMode.value = caps.defaultThinkingMode || 'fast'
    }
    // 重置其他可能残留的参数
    negativePrompt.value = ''
    seed.value = -1
    guidanceScale.value = 2.5
    watermark.value = false
  }
}, { immediate: true })

// 监听模型变化，重置可能的残留参数（非 NanoBanana 模型）
watch(() => selectedAimodel.value?.modelType, (newModelType, oldModelType) => {
  // NanoBanana 模型已经在上面的 watch 中处理
  if (!newModelType || ['nanobanana', 'nanobanana-pro', 'nanobanana-2'].includes(newModelType)) return

  // 切换到非 NanoBanana 模型时，重置搜索开关
  if (newModelType !== oldModelType) {
    enableWebSearch.value = false
    enableImageSearch.value = false
  }
})

// 监听尺寸选项变化，自动选择第一个有效选项
watch([currentSizeOptions, () => selectedAimodel.value], () => {
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
  // 检查当前宽高比是否在选项中，不在则使用默认值（NanoBanana 用 1:1，其他用 auto）
  if (!options.some(option => option.value === aspectRatio.value)) {
    if (isNanoBananaModel.value) {
      aspectRatio.value = '1:1'
    } else {
      aspectRatio.value = 'auto'
    }
  }
}, { immediate: true })

// 旧逻辑保留（兼容非 NanoBanana 模型切换时的重置）
watch(selectedAimodelId, (newId, oldId) => {
  // 首次加载或未切换时不重置
  if (oldId === null || newId === oldId) return
  // NanoBanana 模型已经在上面处理
  if (isNanoBananaModel.value) return
  // 重置所有模型参数到默认值（非 NanoBanana）
  size.value = '1024x1024'
  quality.value = 'standard'
  style.value = 'vivid'
  aspectRatio.value = 'auto'
  seed.value = -1
  guidanceScale.value = 2.5
  watermark.value = false
  background.value = 'auto'
  negativePrompt.value = ''
  enableWebSearch.value = false
  enableImageSearch.value = false
})

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
          <img :src="img" class="w-full h-full object-cover" />
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
