<script setup lang="ts">
import type { ModelCategory, ModelType, ApiFormat, ModelCapability, ApiKeyConfig, ModelUICapabilities } from '../../shared/types'
import type { AimodelInput } from '../../composables/useUpstreams'
import {
  IMAGE_MODEL_REGISTRY,
  VIDEO_MODEL_REGISTRY,
  getApiFormatsForModelType,
  getModelTypeLabel,
  getApiFormatLabel,
  getModelTypeDefaults,
} from '../../shared/registry'
import { inferChatModelType, MODEL_CATEGORY_OPTIONS } from '../../shared/constants'
import { VENDOR_DISPLAY_NAMES, getModelGroup, getVendorDisplayName } from '../../shared/model-inference'

const props = defineProps<{
  apiKeys: ApiKeyConfig[]
}>()

const emit = defineEmits<{
  save: [model: AimodelInput]
}>()

const open = defineModel<boolean>('open', { default: false })
const editingModel = defineModel<AimodelInput | null>('model', { default: null })

// 表单数据
const form = reactive<AimodelInput>({
  category: 'chat',
  modelType: 'gpt',
  apiFormat: 'openai-chat',
  modelName: '',
  name: '',
  capabilities: [],
  vendor: null,
  uiCapabilities: null,
  estimatedTime: 60,
  keyName: 'default',
})

// UI 能力配置（展开的表单）
const uiCaps = reactive<ModelUICapabilities>({})

// 监听编辑模型变化
watch(editingModel, (model) => {
  if (model) {
    Object.assign(form, {
      id: model.id,
      category: model.category,
      modelType: model.modelType,
      apiFormat: model.apiFormat,
      modelName: model.modelName,
      name: model.name,
      capabilities: model.capabilities || [],
      vendor: model.vendor || null,
      uiCapabilities: model.uiCapabilities || null,
      estimatedTime: model.estimatedTime || 60,
      keyName: model.keyName || 'default',
    })
    // 展开 uiCapabilities 到表单
    if (model.uiCapabilities) {
      Object.assign(uiCaps, model.uiCapabilities)
    } else {
      Object.keys(uiCaps).forEach(key => delete (uiCaps as any)[key])
    }
  } else {
    // 重置表单
    Object.assign(form, {
      id: undefined,
      category: 'chat',
      modelType: 'gpt',
      apiFormat: 'openai-chat',
      modelName: '',
      name: '',
      capabilities: [],
      vendor: null,
      uiCapabilities: null,
      estimatedTime: 60,
      keyName: 'default',
    })
    Object.keys(uiCaps).forEach(key => delete (uiCaps as any)[key])
  }
}, { immediate: true })

// 是否编辑模式
const isEdit = computed(() => !!editingModel.value?.id)

// 模态框标题
const modalTitle = computed(() => isEdit.value ? '编辑模型' : '添加模型')

// 可用的 Key 名称列表
const availableKeyNames = computed(() => {
  return props.apiKeys.map(k => ({ label: k.name, value: k.name }))
})

// 厂商选项（从 VENDOR_DISPLAY_NAMES 生成）
const vendorOptions = computed(() => {
  const vendors = Object.entries(VENDOR_DISPLAY_NAMES).map(([key, label]) => ({
    label,
    value: key,
  }))
  // 添加"自动推断"选项
  return [
    { label: '自动推断', value: null },
    ...vendors.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')),
  ]
})

// 推断的厂商（用于显示）
const inferredVendor = computed(() => {
  if (form.vendor) return getVendorDisplayName(form.vendor)
  if (form.modelName) {
    const v = getModelGroup(form.modelName)
    return getVendorDisplayName(v)
  }
  return '自动推断'
})

// 获取可用的请求格式
function getAvailableFormats(modelType: ModelType): ApiFormat[] {
  return getApiFormatsForModelType(modelType) as ApiFormat[]
}

// 分类变化时重置相关字段
function onCategoryChange() {
  if (form.category === 'image') {
    form.modelType = 'midjourney'
    form.apiFormat = 'mj-proxy'
    form.estimatedTime = 60
  } else if (form.category === 'video') {
    form.modelType = 'jimeng-video'
    form.apiFormat = 'video-unified'
    form.estimatedTime = 120
  } else {
    form.modelType = 'gpt'
    form.apiFormat = 'openai-chat'
    form.estimatedTime = 5
  }
  form.modelName = ''
  form.name = ''
  form.capabilities = []
  form.vendor = null
  Object.keys(uiCaps).forEach(key => delete (uiCaps as any)[key])
}

// 模型类型变化时更新默认值
function onModelTypeChange() {
  const availableFormats = getAvailableFormats(form.modelType)
  if (!availableFormats.includes(form.apiFormat)) {
    form.apiFormat = availableFormats[0] || 'openai-chat'
  }

  const defaults = getModelTypeDefaults(form.modelType)
  if (defaults) {
    form.modelName = defaults.modelName || ''
    form.estimatedTime = defaults.estimatedTime || 60
  }
  form.name = getModelTypeLabel(form.modelType) || ''
}

// 监听对话模型名称变化，自动推断类型（不改变 API 格式）
watch(() => form.modelName, (newName) => {
  if (form.category !== 'chat') return

  form.name = newName
  const inferred = inferChatModelType(newName)
  if (inferred) {
    form.modelType = inferred
    // 不自动更改 apiFormat，让用户手动选择
  }
})

/**
 * 监听图片模型名称变化，自动推断 NanoBanana 模型能力
 */
watch(() => form.modelName, (newName) => {
  if (form.category !== 'image') return
  if (!newName) return

  const name = newName.toLowerCase()
  const constraints = getNanoBananaConstraintsByName(name)

  if (constraints) {
    // 识别为 NanoBanana 模型，自动设置 uiCapabilities
    uiCaps.referenceImage = true
    uiCaps.aspectRatios = [...constraints.supportedAspectRatios]
    uiCaps.sizes = [...constraints.supportedSizes]
    uiCaps.webSearch = constraints.supportsWebSearch
    uiCaps.imageSearch = constraints.supportsImageSearch
    uiCaps.thinkingModesEnabled = constraints.supportsThinking
  }
})

/**
 * 根据模型名称获取 NanoBanana 约束
 */
function getNanoBananaConstraintsByName(modelName: string): NanoBananaModelConstraints | null {
  const name = modelName.toLowerCase()
  if (name.includes('nanobanana-2') || name.includes('gemini-3.1')) {
    return NANOBANANA_CONSTRAINTS['nanobanana-2']
  }
  if (name.includes('nanobanana-pro') || name.includes('gemini-3-pro')) {
    return NANOBANANA_CONSTRAINTS['nanobanana-pro']
  }
  if (name.includes('nanobanana') || name.includes('gemini-2.5')) {
    return NANOBANANA_CONSTRAINTS['nanobanana']
  }
  return null
}

// 能力选项
const capabilityOptions: { label: string; value: ModelCapability; icon: string }[] = [
  { label: '视觉', value: 'vision', icon: 'i-heroicons-eye' },
  { label: '推理', value: 'reasoning', icon: 'i-heroicons-light-bulb' },
  { label: '工具', value: 'function_calling', icon: 'i-heroicons-wrench' },
  { label: '联网', value: 'web_search', icon: 'i-heroicons-globe-alt' },
]

// 切换能力
function toggleCapability(cap: ModelCapability) {
  const index = form.capabilities?.indexOf(cap) ?? -1
  if (index === -1) {
    form.capabilities = [...(form.capabilities || []), cap]
  } else {
    form.capabilities = form.capabilities?.filter(c => c !== cap) || []
  }
}

// 常用宽高比选项
const aspectRatioOptions = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']

// 常用尺寸选项
const sizeOptions = ['1024x1024', '1536x1024', '1024x1536', '1280x720', '1920x1080']

// 切换宽高比选项
function toggleAspectRatio(ratio: string) {
  if (!uiCaps.aspectRatios) uiCaps.aspectRatios = []
  const index = uiCaps.aspectRatios.indexOf(ratio)
  if (index === -1) {
    uiCaps.aspectRatios.push(ratio)
  } else {
    uiCaps.aspectRatios.splice(index, 1)
  }
}

// 切换尺寸选项
function toggleSize(size: string) {
  if (!uiCaps.sizes) uiCaps.sizes = []
  const index = uiCaps.sizes.indexOf(size)
  if (index === -1) {
    uiCaps.sizes.push(size)
  } else {
    uiCaps.sizes.splice(index, 1)
  }
}

// ============================================================
// NanoBanana 模型能力定义（严格对应 Google 官方文档）
// ============================================================

/**
 * NanoBanana 模型配置约束（用于模型配置页面 UI 隔离）
 */
interface NanoBananaModelConstraints {
  /** 模型类型 */
  modelType: 'nanobanana' | 'nanobanana-pro' | 'nanobanana-2'
  /** 模型显示名称 */
  displayName: string
  /** 支持的尺寸列表 */
  supportedSizes: string[]
  /** 支持的宽高比列表 */
  supportedAspectRatios: string[]
  /** 是否支持联网搜索 */
  supportsWebSearch: boolean
  /** 是否支持图片搜索 */
  supportsImageSearch: boolean
  /** 是否支持思考模式 */
  supportsThinking: boolean
}

/**
 * NanoBanana 模型约束配置表
 * 严格遵循 Google 官方文档
 */
const NANOBANANA_CONSTRAINTS: Record<string, NanoBananaModelConstraints> = {
  // NanoBanana: gemini-2.5-flash-image
  // 官方限制：仅 1K，无搜索/思考
  'nanobanana': {
    modelType: 'nanobanana',
    displayName: 'NanoBanana',
    supportedSizes: ['1K'],
    supportedAspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    supportsWebSearch: false,
    supportsImageSearch: false,
    supportsThinking: false,
  },
  // NanoBanana Pro: gemini-3-pro-image-preview
  // 官方限制：支持 1K/2K/4K，仅联网搜索
  'nanobanana-pro': {
    modelType: 'nanobanana-pro',
    displayName: 'NanoBanana Pro',
    supportedSizes: ['1K', '2K', '4K'],
    supportedAspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    supportsWebSearch: true,
    supportsImageSearch: false,
    supportsThinking: false,
  },
  // NanoBanana 2: gemini-3.1-flash-image-preview
  // 官方限制：全功能支持，包含极端宽高比
  'nanobanana-2': {
    modelType: 'nanobanana-2',
    displayName: 'NanoBanana 2',
    supportedSizes: ['512', '1K', '2K', '4K'],
    supportedAspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:4', '4:1', '1:8', '8:1'],
    supportsWebSearch: true,
    supportsImageSearch: true,
    supportsThinking: true,
  },
}

/**
 * NanoBanana 模型尺寸标签映射
 */
const nanoBananaSizeLabelMap: Record<string, string> = {
  '512': '512 极速',
  '1K': '1K 标准',
  '2K': '2K 高清',
  '4K': '4K 超清',
}

/**
 * NanoBanana 模型宽高比标签映射
 */
const nanoBananaAspectRatioLabelMap: Record<string, string> = {
  '1:1': '1:1 正方形',
  '16:9': '16:9 宽屏',
  '9:16': '9:16 竖屏',
  '4:3': '4:3 横版',
  '3:4': '3:4 竖版',
  '3:2': '3:2 横版',
  '2:3': '2:3 竖版',
  '1:4': '1:4 极限竖版',
  '4:1': '4:1 极限横版',
  '1:8': '1:8 超长竖版',
  '8:1': '8:1 超长横版',
}

/**
 * 获取 NanoBanana 模型适用的尺寸选项（严格按约束）
 */
const nanoBananaSizeOptions = computed(() => {
  const caps = currentNanoBananaConstraints.value
  if (!caps) return []
  return caps.supportedSizes.map(size => ({
    label: nanoBananaSizeLabelMap[size] || size,
    value: size,
  }))
})

/**
 * 获取 NanoBanana 模型适用的宽高比选项（严格按约束）
 */
const nanoBananaAspectRatioOptions = computed(() => {
  const caps = currentNanoBananaConstraints.value
  if (!caps) return []
  return caps.supportedAspectRatios.map(ratio => ({
    label: nanoBananaAspectRatioLabelMap[ratio] || ratio,
    value: ratio,
  }))
})

// ============================================================
// Google/NanoBanana 模型识别（支持模型类型和模型名称双重识别）
// ============================================================

/**
 * 判断模型名称是否包含 Google/NanoBanana 关键字
 */
const modelNameContainsGoogleKeyword = computed(() => {
  const name = form.modelName?.toLowerCase() || ''
  return name.includes('gemini') || name.includes('nanobanana')
})

/**
 * 判断是否为 NanoBanana 模型（支持类型和名称识别）
 */
const isNanoBananaModel = computed(() => {
  // 1. 先按模型类型判断
  if (['nanobanana', 'nanobanana-pro', 'nanobanana-2'].includes(form.modelType)) {
    return true
  }
  // 2. 按模型名称关键字判断（nanobanana 系列）
  const name = form.modelName?.toLowerCase() || ''
  return name.includes('nanobanana')
})

/**
 * 判断是否为 Google 系列图像模型（支持类型和名称识别）
 * 包括：gemini、nanobanana、nanobanana-pro、nanobanana-2
 */
const isGoogleImageModel = computed(() => {
  // NanoBanana 模型已经在上面单独处理
  if (isNanoBananaModel.value) {
    return true
  }
  // 1. 先按模型类型判断
  if (['gemini'].includes(form.modelType)) {
    return true
  }
  // 2. 按模型名称关键字判断（gemini 系列，但排除 nanobanana）
  const name = form.modelName?.toLowerCase() || ''
  return name.includes('gemini') && !name.includes('nanobanana')
})

/**
 * 获取当前 NanoBanana 模型的约束
 */
const currentNanoBananaConstraints = computed(() => {
  // 优先按模型类型获取约束
  if (['nanobanana', 'nanobanana-pro', 'nanobanana-2'].includes(form.modelType)) {
    return NANOBANANA_CONSTRAINTS[form.modelType] || null
  }
  // 按模型名称获取约束
  const name = form.modelName?.toLowerCase() || ''
  if (name.includes('nanobanana-2') || name.includes('gemini-3.1')) {
    return NANOBANANA_CONSTRAINTS['nanobanana-2']
  }
  if (name.includes('nanobanana-pro') || name.includes('gemini-3-pro')) {
    return NANOBANANA_CONSTRAINTS['nanobanana-pro']
  }
  if (name.includes('nanobanana') || name.includes('gemini-2.5')) {
    return NANOBANANA_CONSTRAINTS['nanobanana']
  }
  return null
})

/**
 * Google 模型专用尺寸选项（用于非 NanoBanana 模型）
 */
const googleSizeOptions = [
  { label: '1024x1024', value: '1024x1024' },
  { label: '1024x1792', value: '1024x1792' },
  { label: '1792x1024', value: '1792x1024' },
  { label: '1536x1024', value: '1536x1024' },
  { label: '1024x1536', value: '1024x1536' },
  { label: '1280x720', value: '1280x720' },
  { label: '1920x1080', value: '1920x1080' },
  { label: '1K (1024)', value: '1K' },
  { label: '2K (2048)', value: '2K' },
  { label: '4K (4096)', value: '4K' },
  { label: '512', value: '512' },
]

/**
 * Google 模型专用宽高比选项（用于非 NanoBanana 模型）
 */
const googleAspectRatioOptions = [
  '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9',
  '1:4', '4:1', '8:1', '1:8', '4:5', '5:4',
]

/**
 * 获取当前模型适用的宽高比选项
 */
const currentAspectRatioOptions = computed(() => {
  if (isNanoBananaModel.value) {
    return nanoBananaAspectRatioOptions.value
  }
  return isGoogleImageModel.value ? googleAspectRatioOptions : aspectRatioOptions
})

/**
 * 获取当前模型适用的尺寸选项
 */
const currentSizeOptions = computed(() => {
  if (isNanoBananaModel.value) {
    return nanoBananaSizeOptions.value
  }
  return isGoogleImageModel.value ? googleSizeOptions : sizeOptions
})

// 保存
function onSave() {
  // 对于 NanoBanana 模型，强制设置 negativePrompt 为 false
  // 因为 NanoBanana 配置界面不显示负面提示词选项，需要显式设置
  if (isNanoBananaModel.value) {
    uiCaps.negativePrompt = false
  }

  // 构建 uiCapabilities 对象（包含所有显式设置的值，包括 false）
  // 确保 NanoBanana 模型的 negativePrompt: false 被保存
  const uiCapsToSave: Record<string, any> = {}
  const knownKeys = ['negativePrompt', 'quality', 'style', 'seed', 'guidance',
                     'watermark', 'background', 'referenceImage', 'webSearch',
                     'imageSearch', 'thinkingModesEnabled', 'sizes', 'aspectRatios']

  for (const key of knownKeys) {
    if (key in uiCaps) {
      uiCapsToSave[key] = (uiCaps as any)[key]
    }
  }

  // 对于 NanoBanana 模型，确保 negativePrompt: false 被添加到保存对象
  if (isNanoBananaModel.value) {
    uiCapsToSave.negativePrompt = false
  }

  // 检查是否有任何配置
  const hasUiCaps = Object.keys(uiCapsToSave).length > 0
  form.uiCapabilities = hasUiCaps ? uiCapsToSave : null

  emit('save', { ...form })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <div class="space-y-4">
        <!-- 分类 -->
        <UFormField label="分类">
          <USelectMenu
            v-model="form.category"
            :items="MODEL_CATEGORY_OPTIONS"
            value-key="value"
            class="w-32"
            @update:model-value="onCategoryChange"
          />
        </UFormField>

        <!-- 模型类型（绘图/视频） -->
        <UFormField v-if="form.category === 'image'" label="模型类型">
          <USelectMenu
            v-model="form.modelType"
            :items="IMAGE_MODEL_REGISTRY.map(m => ({ label: m.label, value: m.type }))"
            value-key="value"
            class="w-48"
            @update:model-value="onModelTypeChange"
          />
        </UFormField>

        <UFormField v-if="form.category === 'video'" label="模型类型">
          <USelectMenu
            v-model="form.modelType"
            :items="VIDEO_MODEL_REGISTRY.map(m => ({ label: m.label, value: m.type }))"
            value-key="value"
            class="w-48"
            @update:model-value="onModelTypeChange"
          />
        </UFormField>

        <!-- API 格式 -->
        <UFormField label="API 格式">
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="f in getAvailableFormats(form.modelType)"
              :key="f"
              size="xs"
              :variant="form.apiFormat === f ? 'solid' : 'outline'"
              :color="form.apiFormat === f ? 'primary' : 'neutral'"
              type="button"
              @click="form.apiFormat = f"
            >
              {{ getApiFormatLabel(f) }}
            </UButton>
          </div>
        </UFormField>

        <!-- 模型名称 -->
        <UFormField label="模型名称" :hint="form.category === 'chat' ? '输入后自动推断类型' : ''">
          <UInput
            v-model="form.modelName"
            :placeholder="form.category === 'chat' ? 'gpt-4o, claude-3-opus...' : '可选'"
            class="w-full"
          />
        </UFormField>

        <!-- 显示名称 -->
        <UFormField label="显示名称">
          <UInput
            v-model="form.name"
            placeholder="在模型选择器中显示的名称"
            class="w-full"
          />
        </UFormField>

        <!-- 厂商选择 -->
        <UFormField label="厂商">
          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="form.vendor"
              :items="vendorOptions"
              value-key="value"
              class="w-40"
              placeholder="自动推断"
            />
            <span class="text-xs text-(--ui-text-muted)">
              当前: {{ inferredVendor }}
            </span>
          </div>
        </UFormField>

        <!-- 模型能力（仅对话模型） -->
        <UFormField v-if="form.category === 'chat'" label="模型能力">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="cap in capabilityOptions"
              :key="cap.value"
              size="sm"
              :variant="form.capabilities?.includes(cap.value) ? 'solid' : 'outline'"
              :color="form.capabilities?.includes(cap.value) ? 'primary' : 'neutral'"
              type="button"
              @click="toggleCapability(cap.value)"
            >
              <UIcon :name="cap.icon" class="w-4 h-4 mr-1" />
              {{ cap.label }}
            </UButton>
          </div>
        </UFormField>

        <!-- UI 能力配置（图片/视频模型） -->
        <div v-if="form.category === 'image' || form.category === 'video'" class="space-y-3 pt-2 border-t border-(--ui-border)">
          <!-- NanoBanana 模型的严格配置 -->
          <template v-if="isNanoBananaModel">
            <div class="text-sm font-medium text-(--ui-text)">
              UI 能力配置（NanoBanana · {{ currentNanoBananaConstraints?.displayName }}）
            </div>
            <p class="text-xs text-(--ui-text-muted)">
              已根据 Google 官方文档限制，仅显示支持的选项
            </p>

            <!-- NanoBanana 尺寸配置 -->
            <UFormField label="支持的尺寸">
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="size in nanoBananaSizeOptions"
                  :key="size.value"
                  size="xs"
                  :variant="uiCaps.sizes?.includes(size.value) ? 'solid' : 'outline'"
                  :color="uiCaps.sizes?.includes(size.value) ? 'primary' : 'neutral'"
                  type="button"
                  @click="toggleSize(size.value)"
                >
                  {{ size.label }}
                </UButton>
              </div>
            </UFormField>

            <!-- NanoBanana 宽高比配置 -->
            <UFormField label="支持的宽高比">
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="ratio in nanoBananaAspectRatioOptions"
                  :key="ratio.value"
                  size="xs"
                  :variant="uiCaps.aspectRatios?.includes(ratio.value) ? 'solid' : 'outline'"
                  :color="uiCaps.aspectRatios?.includes(ratio.value) ? 'primary' : 'neutral'"
                  type="button"
                  @click="toggleAspectRatio(ratio.value)"
                >
                  {{ ratio.label }}
                </UButton>
              </div>
            </UFormField>

            <!-- NanoBanana 增强功能（严格按模型能力） -->
            <div class="grid grid-cols-2 gap-3">
              <!-- 参考图：全部支持 -->
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.referenceImage" />
                <span class="text-sm text-(--ui-text)">支持参考图</span>
              </label>

              <!-- 联网搜索（仅 nanobanana-pro 和 nanobanana-2 支持） -->
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox
                  v-model="uiCaps.webSearch"
                  :disabled="!currentNanoBananaConstraints?.supportsWebSearch"
                />
                <span class="text-sm" :class="currentNanoBananaConstraints?.supportsWebSearch ? 'text-(--ui-text)' : 'text-(--ui-text-dimmed)'">
                  启用 Google 搜索
                  <span v-if="!currentNanoBananaConstraints?.supportsWebSearch" class="text-xs text-(--ui-text-muted)">（不支持）</span>
                </span>
              </label>

              <!-- 图片搜索（仅 nanobanana-2 支持） -->
              <label v-if="form.modelType === 'nanobanana-2'" class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.imageSearch" />
                <span class="text-sm text-(--ui-text)">启用图片搜索</span>
              </label>

              <!-- 思考模式（仅 nanobanana-2 支持） -->
              <label v-if="form.modelType === 'nanobanana-2'" class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.thinkingModesEnabled" />
                <span class="text-sm text-(--ui-text)">启用思考模式（快速/深度）</span>
              </label>
            </div>
          </template>

          <!-- 非 NanoBanana 的 Google 模型配置 -->
          <template v-else-if="isGoogleImageModel">
            <div class="text-sm font-medium text-(--ui-text)">UI 能力配置（Google 模型）</div>
            <p class="text-xs text-(--ui-text-muted)">Google 模型支持：宽高比、尺寸、参考图</p>

            <!-- 宽高比 -->
            <UFormField label="支持的宽高比">
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="ratio in currentAspectRatioOptions"
                  :key="ratio"
                  size="xs"
                  :variant="uiCaps.aspectRatios?.includes(ratio) ? 'solid' : 'outline'"
                  :color="uiCaps.aspectRatios?.includes(ratio) ? 'primary' : 'neutral'"
                  type="button"
                  @click="toggleAspectRatio(ratio)"
                >
                  {{ ratio }}
                </UButton>
              </div>
            </UFormField>

            <!-- 尺寸 -->
            <UFormField label="支持的尺寸">
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="size in currentSizeOptions"
                  :key="size.value"
                  size="xs"
                  :variant="uiCaps.sizes?.includes(size.value) ? 'solid' : 'outline'"
                  :color="uiCaps.sizes?.includes(size.value) ? 'primary' : 'neutral'"
                  type="button"
                  @click="toggleSize(size.value)"
                >
                  {{ size.label }}
                </UButton>
              </div>
            </UFormField>

            <!-- 参考图 -->
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.referenceImage" />
                <span class="text-sm text-(--ui-text)">支持参考图</span>
              </label>
            </div>
          </template>

          <!-- 非 Google 模型的标准配置 -->
          <template v-else>
            <div class="text-sm font-medium text-(--ui-text)">UI 能力配置（可选）</div>
            <p class="text-xs text-(--ui-text-muted)">配置后覆盖默认推断，留空使用自动推断</p>

            <!-- 宽高比 -->
            <UFormField label="支持的宽高比">
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="ratio in currentAspectRatioOptions"
                  :key="ratio"
                  size="xs"
                  :variant="uiCaps.aspectRatios?.includes(ratio) ? 'solid' : 'outline'"
                  :color="uiCaps.aspectRatios?.includes(ratio) ? 'primary' : 'neutral'"
                  type="button"
                  @click="toggleAspectRatio(ratio)"
                >
                  {{ ratio }}
                </UButton>
              </div>
            </UFormField>

            <!-- 尺寸（仅图片模型） -->
            <UFormField v-if="form.category === 'image'" label="支持的尺寸">
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="size in currentSizeOptions"
                  :key="size.value || size"
                  size="xs"
                  :variant="uiCaps.sizes?.includes(typeof size === 'string' ? size : size.value) ? 'solid' : 'outline'"
                  :color="uiCaps.sizes?.includes(typeof size === 'string' ? size : size.value) ? 'primary' : 'neutral'"
                  type="button"
                  @click="toggleSize(typeof size === 'string' ? size : size.value)"
                >
                  {{ typeof size === 'string' ? size : size.label }}
                </UButton>
              </div>
            </UFormField>

            <!-- 其他开关（非 Google 模型） -->
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.negativePrompt" />
                <span class="text-sm text-(--ui-text)">支持负面提示词</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.quality" />
                <span class="text-sm text-(--ui-text)">支持质量参数</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.style" />
                <span class="text-sm text-(--ui-text)">支持风格参数</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.seed" />
                <span class="text-sm text-(--ui-text)">支持随机种子</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.referenceImage" />
                <span class="text-sm text-(--ui-text)">支持参考图</span>
              </label>
              <label v-if="form.category === 'video'" class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="uiCaps.enhancePrompt" />
                <span class="text-sm text-(--ui-text)">支持提示词增强</span>
              </label>
            </div>
          </template>
        </div>

        <!-- 预计时间 -->
        <UFormField label="预计时间（秒）">
          <UInput
            v-model.number="form.estimatedTime"
            type="number"
            min="1"
            class="w-24"
          />
        </UFormField>

        <!-- 使用的 Key -->
        <UFormField v-if="apiKeys.length > 1" label="使用的 Key">
          <USelectMenu
            v-model="form.keyName"
            :items="availableKeyNames"
            value-key="value"
            placeholder="default"
            class="w-40"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton variant="outline" color="neutral" @click="open = false">取消</UButton>
        <UButton @click="onSave">保存</UButton>
      </div>
    </template>
  </UModal>
</template>
