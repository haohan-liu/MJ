<script setup lang="ts">
import { SITE_SETTING_KEYS, type SiteSettingKey } from '~/shared/constants'

definePageMeta({
  middleware: 'auth',
})

const { user } = useAuth()
const toast = useToast()

// 检查管理员权限
if (user.value?.role !== 'admin') {
  navigateTo('/settings')
}

const isLoading = ref(true)
const isSaving = ref(false)
const isCleaningUp = ref(false)
const cleanedCount = ref<number | null>(null)

// 表单数据
const form = reactive({
  siteName: '',
  siteSlogan: '',
  siteCopyright: '',
  siteLogoUrl: '',
  apiPlatformUrl: '',
  apiPlatformName: '',
  newApiBaseUrl: '',
  taskRetentionDays: 30,
  // 存储配置
  storageType: 'local' as 'local' | 'cos',
  cosSecretId: '',
  cosSecretKey: '',
  cosBucket: '',
  cosRegion: '',
})

// 加载配置
async function loadSettings() {
  isLoading.value = true
  try {
    const settings = await $fetch<Record<SiteSettingKey, string>>('/api/admin/site-settings')
    form.siteName = settings[SITE_SETTING_KEYS.SITE_NAME] || ''
    form.siteSlogan = settings[SITE_SETTING_KEYS.SITE_SLOGAN] || ''
    form.siteCopyright = settings[SITE_SETTING_KEYS.SITE_COPYRIGHT] || ''
    form.siteLogoUrl = settings[SITE_SETTING_KEYS.SITE_LOGO_URL] || ''
    form.apiPlatformUrl = settings[SITE_SETTING_KEYS.API_PLATFORM_URL] || ''
    form.apiPlatformName = settings[SITE_SETTING_KEYS.API_PLATFORM_NAME] || ''
    form.newApiBaseUrl = settings[SITE_SETTING_KEYS.NEW_API_BASE_URL] || ''
    form.taskRetentionDays = Number(settings[SITE_SETTING_KEYS.TASK_RETENTION_DAYS]) || 30
    // 存储配置
    form.storageType = (settings[SITE_SETTING_KEYS.STORAGE_TYPE] as 'local' | 'cos') || 'local'
    form.cosSecretId = settings[SITE_SETTING_KEYS.COS_SECRET_ID] || ''
    form.cosSecretKey = settings[SITE_SETTING_KEYS.COS_SECRET_KEY] || ''
    form.cosBucket = settings[SITE_SETTING_KEYS.COS_BUCKET] || ''
    form.cosRegion = settings[SITE_SETTING_KEYS.COS_REGION] || ''
  } catch (error: any) {
    toast.add({
      title: '加载失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}

// 保存配置
async function saveSettings() {
  isSaving.value = true
  try {
    await $fetch('/api/admin/site-settings', {
      method: 'PUT',
      body: {
        [SITE_SETTING_KEYS.SITE_NAME]: form.siteName,
        [SITE_SETTING_KEYS.SITE_SLOGAN]: form.siteSlogan,
        [SITE_SETTING_KEYS.SITE_COPYRIGHT]: form.siteCopyright,
        [SITE_SETTING_KEYS.SITE_LOGO_URL]: form.siteLogoUrl,
        [SITE_SETTING_KEYS.API_PLATFORM_URL]: form.apiPlatformUrl,
        [SITE_SETTING_KEYS.API_PLATFORM_NAME]: form.apiPlatformName,
        [SITE_SETTING_KEYS.NEW_API_BASE_URL]: form.newApiBaseUrl,
        [SITE_SETTING_KEYS.TASK_RETENTION_DAYS]: String(form.taskRetentionDays),
        // 存储配置
        [SITE_SETTING_KEYS.STORAGE_TYPE]: form.storageType,
        [SITE_SETTING_KEYS.COS_SECRET_ID]: form.cosSecretId,
        [SITE_SETTING_KEYS.COS_SECRET_KEY]: form.cosSecretKey,
        [SITE_SETTING_KEYS.COS_BUCKET]: form.cosBucket,
        [SITE_SETTING_KEYS.COS_REGION]: form.cosRegion,
      },
    })
    toast.add({ title: '配置已保存', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: '保存失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isSaving.value = false
  }
}

// 手动触发清理过期任务
async function handleCleanup() {
  isCleaningUp.value = true
  cleanedCount.value = null
  try {
    const result = await $fetch<{
      success: boolean
      count: number
      message: string
    }>('/api/admin/cleanup-tasks', {
      method: 'POST',
    })
    if (result.success) {
      // 防呆兜底：确保为数字而非 undefined/null，避免 NaN
      cleanedCount.value = result.count ?? 0
      toast.add({
        title: `清除成功，清除了 ${cleanedCount.value} 个文件`,
        color: 'success',
      })
    }
  } catch (error: any) {
    toast.add({
      title: '清理失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isCleaningUp.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <SettingsLayout>
    <div class="space-y-6">
      <!-- 页面标题 -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-medium text-(--ui-text)">站点配置</h2>
          <p class="text-(--ui-text-muted) text-sm mt-1">配置网站的基本信息和外部链接</p>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="isLoading" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
      </div>

      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- 配置表单 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-6">
          <!-- 基本信息 -->
          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">基本信息</h3>
            
            <UFormField label="网站名称">
              <UInput
                v-model="form.siteName"
                placeholder="MJ Studio"
                class="w-full"
              />
            </UFormField>

            <UFormField label="网站标语">
              <UInput
                v-model="form.siteSlogan"
                placeholder="AI 创作工作台"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Logo URL（可选）">
              <UInput
                v-model="form.siteLogoUrl"
                placeholder="https://example.com/logo.png"
                class="w-full"
              />
            </UFormField>

            <UFormField label="版权信息">
              <UInput
                v-model="form.siteCopyright"
                placeholder="© 2026 MJ Studio. All rights reserved."
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="border-t border-(--ui-border)" />

          <!-- API 平台配置 -->
          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">API 平台配置</h3>
            <p class="text-sm text-(--ui-text-muted)">配置 API 聚合平台链接，引导用户获取 API Key</p>

            <UFormField label="平台名称">
              <UInput
                v-model="form.apiPlatformName"
                placeholder="API 平台"
                class="w-full"
              />
            </UFormField>

            <UFormField label="平台链接">
              <UInput
                v-model="form.apiPlatformUrl"
                placeholder="https://api.example.com"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="border-t border-(--ui-border)" />

          <!-- New API 服务配置 -->
          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">New API 服务配置</h3>
            <p class="text-sm text-(--ui-text-muted)">配置 New API 后端服务地址，用于 API Key 验证和用户登录</p>

            <UFormField label="服务地址">
              <UInput
                v-model="form.newApiBaseUrl"
                placeholder="http://localhost:3000"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="border-t border-(--ui-border)" />

          <!-- 数据保留配置 -->
          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">数据保留配置</h3>
            <p class="text-sm text-(--ui-text-muted)">配置任务数据的保留时间，过期后系统将自动清理</p>

            <UFormField label="任务数据保留天数">
              <UInput
                v-model.number="form.taskRetentionDays"
                type="number"
                min="1"
                max="365"
                placeholder="30"
                class="w-32"
              />
              <template #hint>
                <span class="text-(--ui-text-dimmed) text-xs">超过此天数的任务将被标记为已过期</span>
              </template>
            </UFormField>

            <!-- 手动清理 -->
            <div class="flex items-center gap-4 pt-2">
              <UButton
                :loading="isCleaningUp"
                :disabled="isCleaningUp"
                variant="outline"
                @click="handleCleanup"
              >
                <UIcon name="i-heroicons-trash" class="w-4 h-4 mr-1" />
                立即清理文件
              </UButton>
              <span v-if="cleanedCount !== null" class="text-sm text-(--ui-text-muted)">
                已清理 {{ cleanedCount ?? 0 }} 个文件
              </span>
            </div>
          </div>

          <div class="border-t border-(--ui-border)" />

          <!-- 存储配置 -->
          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">文件存储配置</h3>
            <p class="text-sm text-(--ui-text-muted)">配置图片和视频的存储方式，支持本地存储和腾讯云COS</p>

            <UFormField label="存储方式">
              <URadioGroup v-model="form.storageType" :items="[
                { value: 'local', label: '本地存储' },
                { value: 'cos', label: '腾讯云 COS' },
              ]" />
            </UFormField>

            <template v-if="form.storageType === 'cos'">
              <UFormField label="SecretId">
                <UInput
                  v-model="form.cosSecretId"
                  placeholder="AKIDxxxxxxxxxxxxxxxx"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="SecretKey">
                <UInput
                  v-model="form.cosSecretKey"
                  type="password"
                  placeholder="请输入 SecretKey"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="存储桶">
                <UInput
                  v-model="form.cosBucket"
                  placeholder="new-api-1301453074"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="地域">
                <UInput
                  v-model="form.cosRegion"
                  placeholder="ap-guangzhou"
                  class="w-full"
                />
              </UFormField>
            </template>
          </div>

          <!-- 保存按钮 -->
          <div class="flex justify-end pt-4">
            <UButton :loading="isSaving" @click="saveSettings">
              保存配置
            </UButton>
          </div>
        </div>

        <!-- 实时预览 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border)">
          <h3 class="text-base font-medium text-(--ui-text) mb-4">实时预览</h3>
          
          <!-- 登录页面预览 -->
          <div class="bg-(--ui-bg) rounded-lg p-6 border border-(--ui-border)">
            <div class="text-center mb-6">
              <h1 class="text-2xl font-bold text-(--ui-text) mb-2">
                <span class="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  {{ form.siteName || '网站名称' }}
                </span>
              </h1>
              <p class="text-(--ui-text-muted) text-sm">{{ form.siteSlogan || '网站标语' }}</p>
            </div>

            <div class="bg-(--ui-bg-muted) rounded-lg p-4 border border-(--ui-border)">
              <p class="text-sm text-(--ui-text-toned) mb-3">输入 API Key 开始使用</p>
              <div class="h-10 bg-(--ui-bg) rounded border border-(--ui-border) mb-3"></div>
              <div class="h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded"></div>
              <p v-if="form.apiPlatformUrl" class="mt-3 text-center text-xs">
                <span class="text-(--ui-text-dimmed)">还没有 API Key？</span>
                <span class="text-(--ui-primary) ml-1">前往{{ form.apiPlatformName || 'API 平台' }}注册</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>
