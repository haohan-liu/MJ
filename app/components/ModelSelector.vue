<script setup lang="ts">
import type { Upstream } from '~/composables/useUpstreams'
import type { AvailableUpstream, AvailableAimodel } from '~/composables/useAvailableUpstreams'
import type { ModelCategory } from '~/shared/types'
import { getModelGroup, getVendorDisplayName, getVendorIcon, getVendorLogo } from '~/shared/model-inference'

// 基础模型类型（Aimodel 和 AvailableAimodel 的共同字段）
type BaseAimodel = {
  id: number
  category: ModelCategory
  modelType: string
  apiFormat?: string
  name: string
  modelName?: string
  vendor?: string | null
}

const props = defineProps<{
  upstreams: (Upstream | AvailableUpstream)[]
  category: ModelCategory
  aimodelId?: number | null
  // 只读模式（用于查看，不可选择）
  readOnly?: boolean
  // 下拉面板宽度，默认 w-80 (320px)
  dropdownWidth?: string
  // 使用列表布局而非 grid 布局
  listLayout?: boolean
  // 禁用自动选择默认配置
  noAutoSelect?: boolean
  // 下拉框右对齐（向左展开）
  alignRight?: boolean
  // 紧凑模式（无边框，更小尺寸，适合工具栏）
  compact?: boolean
  // 移动端隐藏文字（仅显示图标）
  hideTextOnMobile?: boolean
}>()

const emit = defineEmits<{
  'update:aimodelId': [id: number | null]
}>()

const router = useRouter()

// 模态框状态
const isModalOpen = ref(false)

// 从 aimodelId 计算 upstreamId
const computedUpstreamId = computed(() => {
  if (!props.aimodelId) return null

  for (const upstream of props.upstreams) {
    if (upstream.aimodels?.some(m => m.id === props.aimodelId)) {
      return upstream.id
    }
  }
  return null
})

// 内部状态
const selectedUpstreamId = ref<number | null>(computedUpstreamId.value)
const selectedAimodelId = ref<number | null>(props.aimodelId ?? null)
const selectedVendor = ref<string | null>(null)

// 同步 props 到内部状态
watch(() => props.aimodelId, (val) => {
  selectedAimodelId.value = val ?? null
  selectedUpstreamId.value = computedUpstreamId.value
  // 同步厂商选择
  if (val) {
    const aimodel = findAimodelById(val)
    if (aimodel) {
      selectedVendor.value = getAimodelVendor(aimodel)
    }
  }
})

// 搜索关键词
const searchQuery = ref('')

// 判断是否是绘图模型类型
function isImageModelType(modelType: string): boolean {
  const imageModels = [
    'midjourney', 'gemini', 'flux', 'dalle', 'doubao',
    'gpt4o-image', 'grok-image', 'qwen-image', 'z-image'
  ]
  return imageModels.includes(modelType)
}

// 过滤出当前分类的模型
function filterModelsByCategory(aimodels: BaseAimodel[]): BaseAimodel[] {
  return aimodels.filter(m => {
    if (props.category === 'image') {
      return m.category === 'image' || (!m.category && isImageModelType(m.modelType))
    } else if (props.category === 'video') {
      return m.category === 'video'
    } else {
      return m.category === 'chat'
    }
  })
}

// 获取模型的厂商（优先使用 vendor 字段，否则推断）
function getAimodelVendor(aimodel: BaseAimodel): string {
  if (aimodel.vendor) return aimodel.vendor
  // 使用 modelName 或 name 进行推断
  return getModelGroup(aimodel.modelName || aimodel.name || '')
}

// 所有模型列表（扁平化）
const allModels = computed(() => {
  const models: (BaseAimodel & { upstreamId: number; upstreamName: string })[] = []
  for (const upstream of props.upstreams) {
    const filteredModels = filterModelsByCategory(upstream.aimodels || [])
    for (const aimodel of filteredModels) {
      models.push({
        ...aimodel,
        upstreamId: upstream.id,
        upstreamName: upstream.name,
      })
    }
  }
  return models
})

// 按厂商分组的模型
const groupedByVendor = computed(() => {
  const groups: Map<string, (BaseAimodel & { upstreamId: number; upstreamName: string })[]> = new Map()
  
  for (const model of allModels.value) {
    const vendor = getAimodelVendor(model)
    if (!groups.has(vendor)) {
      groups.set(vendor, [])
    }
    groups.get(vendor)!.push(model)
  }
  
  // 转换为数组并排序
  return Array.from(groups.entries())
    .map(([vendor, models]) => ({
      vendor,
      displayName: getVendorDisplayName(vendor),
      icon: getVendorIcon(vendor),
      models,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'))
})

// 厂商列表
const vendorList = computed(() => groupedByVendor.value.map(g => ({
  vendor: g.vendor,
  displayName: g.displayName,
  icon: g.icon,
  logo: getVendorLogo(g.vendor),
  count: g.models.length,
})))

// 当前选中厂商的模型列表
const currentVendorModels = computed(() => {
  if (!selectedVendor.value) return []
  const group = groupedByVendor.value.find(g => g.vendor === selectedVendor.value)
  return group?.models || []
})

// 搜索过滤后的结果
const filteredResults = computed(() => {
  if (!searchQuery.value.trim()) {
    return null // 未搜索时返回 null，表示显示厂商选择模式
  }
  
  const query = searchQuery.value.toLowerCase()
  const results: (BaseAimodel & { upstreamId: number; upstreamName: string; vendor: string })[] = []
  
  for (const model of allModels.value) {
    if (
      model.name.toLowerCase().includes(query) ||
      model.modelType.toLowerCase().includes(query) ||
      (model.modelName?.toLowerCase().includes(query))
    ) {
      results.push({
        ...model,
        vendor: getAimodelVendor(model),
      })
    }
  }
  
  return results
})

// 是否有可用模型
const hasModels = computed(() => allModels.value.length > 0)

// 当前选中的上游配置
const selectedUpstream = computed(() => {
  return props.upstreams.find(u => u.id === selectedUpstreamId.value)
})

// 查找模型
function findAimodelById(id: number): BaseAimodel | undefined {
  for (const upstream of props.upstreams) {
    const aimodel = upstream.aimodels?.find(m => m.id === id)
    if (aimodel) return aimodel
  }
  return undefined
}

// 当前选中的 AI 模型
const selectedAimodel = computed((): BaseAimodel | undefined => {
  if (!selectedAimodelId.value) return undefined
  return findAimodelById(selectedAimodelId.value)
})

// 当前显示文本
const currentDisplayText = computed(() => {
  if (!selectedAimodelId.value) {
    return '选择模型'
  }
  const aimodel = selectedAimodel.value
  if (!aimodel) return '选择模型'
  return aimodel.name
})

// 打开模态框
function openModal() {
  if (props.readOnly || !hasModels.value) return
  searchQuery.value = ''
  
  // 如果已有选中的模型，自动选中其厂商；否则显示厂商选择界面
  if (selectedAimodel.value) {
    selectedVendor.value = getAimodelVendor(selectedAimodel.value)
  } else {
    // 默认显示厂商选择界面，不自动选中厂商
    selectedVendor.value = null
  }
  
  isModalOpen.value = true
}

// 选择厂商
function selectVendor(vendor: string) {
  selectedVendor.value = vendor
}

// 返回厂商选择
function backToVendors() {
  selectedVendor.value = null
}

// 选择模型
function handleSelectModel(aimodel: BaseAimodel & { upstreamId: number }) {
  selectedUpstreamId.value = aimodel.upstreamId
  selectedAimodelId.value = aimodel.id
  emit('update:aimodelId', aimodel.id)
  isModalOpen.value = false
}

// 重置
function resetFilters() {
  searchQuery.value = ''
}

// 当配置列表变化时,选择第一个配置（已按 sortOrder 排序）
watch(() => props.upstreams, (upstreams) => {
  if (props.noAutoSelect) return
  if (upstreams.length > 0 && !selectedUpstreamId.value) {
    const firstUpstream = upstreams[0]
    if (firstUpstream) {
      const filteredModels = filterModelsByCategory(firstUpstream.aimodels || [])
      const firstModel = filteredModels[0]
      if (firstModel) {
        handleSelectModel({
          ...firstModel,
          upstreamId: firstUpstream.id,
        })
      }
    }
  }
}, { immediate: true })

// 暴露给父组件
defineExpose({
  selectedUpstream,
  selectedAimodel,
})
</script>

<template>
  <div>
    <!-- 空状态 -->
    <div v-if="upstreams.length === 0" class="text-xs text-(--ui-text-muted) flex items-center">
      <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 mr-1" />
      请先添加{{ category === 'chat' ? '对话' : category === 'video' ? '视频' : '绘图' }}模型
    </div>

    <!-- 触发按钮 -->
    <div v-else>
      <button
        type="button"
        class="flex items-center justify-between transition-colors"
        :class="[
          compact
            ? 'gap-2 px-2 py-1 rounded text-sm hover:bg-(--ui-bg-accented)'
            : [
                'gap-2 w-full px-3 py-2 rounded-lg border border-(--ui-border) bg-(--ui-bg) text-sm',
                hideTextOnMobile ? 'md:min-w-48 px-2 md:px-3 md:w-full' : 'min-w-48'
              ],
          {
            'opacity-50 cursor-not-allowed': !hasModels,
            'hover:bg-(--ui-bg-elevated)': !readOnly && hasModels && !compact,
            'cursor-default': readOnly
          }
        ]"
        :disabled="!hasModels || readOnly"
        @click="openModal"
      >
        <span class="flex items-center gap-2">
          <UIcon name="i-heroicons-cpu-chip" :class="'w-4 h-4'" class="text-(--ui-text-muted)" />
          <span :class="['text-(--ui-text)', hideTextOnMobile ? 'hidden md:inline' : '']">{{ currentDisplayText }}</span>
        </span>
        <UIcon
          v-if="!readOnly"
          name="i-heroicons-chevron-down"
          :class="['w-4 h-4 text-(--ui-text-muted)', hideTextOnMobile ? 'hidden md:inline' : '']"
        />
      </button>
    </div>

    <!-- 模态框 -->
    <UModal v-model:open="isModalOpen" title="选择模型" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <!-- 搜索框 -->
          <UInput
            v-model="searchQuery"
            placeholder="搜索模型..."
            icon="i-heroicons-magnifying-glass"
            class="w-full"
          />

          <!-- 搜索结果模式 -->
          <div v-if="filteredResults" class="max-h-96 overflow-y-auto space-y-2">
            <div v-if="filteredResults.length === 0" class="text-center py-8">
              <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 mx-auto mb-3 text-(--ui-text-dimmed) opacity-50" />
              <p class="text-(--ui-text-muted)">未找到匹配的模型</p>
            </div>
            <button
              v-for="model in filteredResults"
              :key="model.id"
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors border"
              :class="[
                selectedAimodelId === model.id
                  ? 'bg-(--ui-primary)/10 text-(--ui-primary) border-(--ui-primary)'
                  : 'hover:bg-(--ui-bg-accented) text-(--ui-text) border-(--ui-border) hover:border-(--ui-primary)'
              ]"
              @click="handleSelectModel(model)"
            >
              <img v-if="getVendorLogo(model.vendor)" :src="getVendorLogo(model.vendor)" :alt="getVendorDisplayName(model.vendor)" class="w-4 h-4 shrink-0 object-contain" />
              <UIcon v-else :name="getVendorIcon(model.vendor)" class="w-4 h-4 shrink-0 text-(--ui-text-muted)" />
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ model.name }}</div>
                <div class="text-xs text-(--ui-text-muted) truncate">
                  {{ getVendorDisplayName(model.vendor) }} · {{ model.upstreamName }}
                </div>
              </div>
            </button>
          </div>

          <!-- 厂商选择模式 -->
          <div v-else-if="!selectedVendor" class="space-y-3">
            <div class="text-sm text-(--ui-text-muted) mb-2">选择厂商</div>
            <div class="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
              <button
                v-for="v in vendorList"
                :key="v.vendor"
                type="button"
                class="flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors"
                :class="[
                  'hover:bg-(--ui-bg-accented) border-(--ui-border) hover:border-(--ui-primary)'
                ]"
                @click="selectVendor(v.vendor)"
              >
                <img v-if="v.logo" :src="v.logo" :alt="v.displayName" class="w-6 h-6 object-contain" />
                <UIcon v-else :name="v.icon" class="w-6 h-6 text-(--ui-text-muted)" />
                <span class="text-sm text-(--ui-text)">{{ v.displayName }}</span>
                <span class="text-xs text-(--ui-text-dimmed)">{{ v.count }} 个模型</span>
              </button>
            </div>
          </div>

          <!-- 模型选择模式 -->
          <div v-else class="space-y-3">
            <!-- 返回按钮 -->
            <button
              type="button"
              class="flex items-center gap-2 text-sm text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
              @click="backToVendors"
            >
              <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
              返回厂商选择
            </button>

            <!-- 当前厂商标题 -->
            <div class="flex items-center gap-2 px-2 py-2 bg-(--ui-bg-muted) rounded-lg">
              <img v-if="getVendorLogo(selectedVendor)" :src="getVendorLogo(selectedVendor)" :alt="getVendorDisplayName(selectedVendor)" class="w-5 h-5 object-contain" />
              <UIcon v-else :name="getVendorIcon(selectedVendor)" class="w-5 h-5 text-(--ui-text-muted)" />
              <span class="font-medium text-(--ui-text)">{{ getVendorDisplayName(selectedVendor) }}</span>
              <span class="text-xs text-(--ui-text-muted)">({{ currentVendorModels.length }} 个模型)</span>
            </div>

            <!-- 模型列表 -->
            <div class="max-h-64 overflow-y-auto space-y-2">
              <button
                v-for="model in currentVendorModels"
                :key="model.id"
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors border"
                :class="[
                  selectedAimodelId === model.id
                    ? 'bg-(--ui-primary)/10 text-(--ui-primary) border-(--ui-primary)'
                    : 'hover:bg-(--ui-bg-accented) text-(--ui-text) border-(--ui-border) hover:border-(--ui-primary)'
                ]"
                @click="handleSelectModel(model)"
              >
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">{{ model.name }}</div>
                  <div class="text-xs text-(--ui-text-muted) truncate">
                    {{ model.upstreamName }}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
