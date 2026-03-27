<script setup lang="ts">
import { USER_SETTING_KEYS } from '~/shared/constants'

definePageMeta({
  middleware: 'auth',
})

const { user, updateUser, logout } = useAuth()
const { settings, isLoaded: settingsLoaded, loadSettings, updateSettings } = useUserSettings()
const toast = useToast()

// 用户数据
const isLoading = ref(true)
const isSaving = ref(false)
const isSavingProfile = ref(false)
const userApiKey = ref<string | null>(null)

// 余额数据
const balanceData = ref<{
  success: boolean
  error?: string
  balances: Array<{
    upstreamId: number
    upstreamName: string
    platform: string
    success: boolean
    quota?: number
    usedQuota?: number
    unlimitedQuota?: boolean
    error?: string
  }>
}>({ success: true, balances: [] })
const isLoadingBalance = ref(false)

// 个人信息表单
const profileForm = reactive({
  name: '',
  avatar: '',
})

// 偏好设置表单
const preferencesForm = reactive({
  blurByDefault: true,
  autoCompressRefImage: true,
})

// API Key 显示状态
const showApiKey = ref(false)

// 加载用户信息和设置
async function loadData() {
  isLoading.value = true
  try {
    // 获取用户信息（包含 API Key）
    const userData = await $fetch<{ apiKey?: string; name?: string; avatar?: string }>('/api/user')
    userApiKey.value = userData.apiKey || null
    profileForm.name = userData.name || ''
    profileForm.avatar = userData.avatar || ''
    
    await loadSettings()
    // 应用用户设置到表单
    if (settingsLoaded.value) {
      preferencesForm.blurByDefault = settings.value[USER_SETTING_KEYS.GENERAL_BLUR_BY_DEFAULT] as boolean ?? true
      preferencesForm.autoCompressRefImage = settings.value[USER_SETTING_KEYS.GENERAL_AUTO_COMPRESS_REF_IMAGE] as boolean ?? true
    }
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

onMounted(() => {
  loadData()
  loadBalance()
})

// 保存个人信息
async function saveProfile() {
  isSavingProfile.value = true
  try {
    await $fetch('/api/user', {
      method: 'PUT',
      body: {
        name: profileForm.name,
        avatar: profileForm.avatar,
      },
    })
    // 更新本地用户状态
    if (user.value) {
      updateUser({
        ...user.value,
        name: profileForm.name,
        avatar: profileForm.avatar,
      })
    }
    toast.add({ title: '个人信息已保存', color: 'success' })
  } catch (error: any) {
    toast.add({
      title: '保存失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isSavingProfile.value = false
  }
}

// 头像上传
const avatarInput = ref<HTMLInputElement | null>(null)

function triggerAvatarUpload() {
  avatarInput.value?.click()
}

function handleAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 检查文件类型
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    toast.add({ title: '请选择 JPG 或 PNG 格式的图片', color: 'error' })
    return
  }

  // 检查文件大小（500KB）
  if (file.size > 500 * 1024) {
    toast.add({ title: '图片大小不能超过 500KB', color: 'error' })
    return
  }

  // 转换为 base64
  const reader = new FileReader()
  reader.onload = (e) => {
    profileForm.avatar = e.target?.result as string
  }
  reader.readAsDataURL(file)

  // 清空 input 以便重复选择同一文件
  target.value = ''
}

// 切换账号（退出登录）
const router = useRouter()
function handleSwitchAccount() {
  logout()
  router.push('/login')
}

// 保存偏好设置
async function savePreferences() {
  isSaving.value = true
  try {
    await updateSettings({
      [USER_SETTING_KEYS.GENERAL_BLUR_BY_DEFAULT]: preferencesForm.blurByDefault,
      [USER_SETTING_KEYS.GENERAL_AUTO_COMPRESS_REF_IMAGE]: preferencesForm.autoCompressRefImage,
    })
    toast.add({ title: '设置已保存', color: 'success' })
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

// 获取掩码后的 API Key
const maskedApiKey = computed(() => {
  const key = userApiKey.value
  if (!key) return '未设置'
  if (showApiKey.value) return key
  // 显示前4位和后4位
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`
})

// 加载余额数据
async function loadBalance() {
  isLoadingBalance.value = true
  try {
    const result = await $fetch<typeof balanceData.value>('/api/user/balance')
    balanceData.value = result
  } catch (error) {
    console.error('加载余额失败:', error)
  } finally {
    isLoadingBalance.value = false
  }
}

// 格式化配额（OneAPI quota 单位为 1/500000 元）
function formatQuota(quota?: number): string {
  if (quota === undefined || quota === null) return '未知'
  const amount = quota / 500000
  if (amount >= 1000) {
    return `¥${(amount / 1000).toFixed(1)}K`
  }
  if (amount >= 1) {
    return `¥${amount.toFixed(2)}`
  }
  return `¥${amount.toFixed(4)}`
}

// 平台类型标签
const platformLabels: Record<string, string> = {
  oneapi: 'OneAPI',
  n1n: 'n1n',
  yunwu: '云雾',
}
</script>

<template>
  <div class="p-6">
    <div class="max-w-2xl mx-auto">
      <!-- 页面标题 -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-(--ui-text)">用户设置</h1>
        <p class="text-(--ui-text-muted) text-sm mt-1">管理你的偏好设置</p>
      </div>

      <!-- 加载状态 -->
      <div v-if="isLoading" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
      </div>

      <!-- 设置内容 -->
      <div v-if="!isLoading" class="space-y-6">
        <!-- 个人信息卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-5">
          <h2 class="text-lg font-medium text-(--ui-text)">个人信息</h2>
          
          <!-- 头像 -->
          <div class="flex flex-col items-center gap-3">
            <div
              class="w-20 h-20 rounded-full overflow-hidden bg-(--ui-bg-muted) flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity border border-(--ui-border)"
              @click="triggerAvatarUpload"
            >
              <img v-if="profileForm.avatar" :src="profileForm.avatar" alt="头像" class="w-full h-full object-cover" />
              <UIcon v-else name="i-heroicons-user" class="w-10 h-10 text-(--ui-text-muted)" />
            </div>
            <div class="text-center">
              <p class="text-sm text-(--ui-text)">点击上传头像</p>
              <p class="text-xs text-(--ui-text-dimmed)">支持 JPG、PNG，最大 500KB</p>
            </div>
            <input
              ref="avatarInput"
              type="file"
              accept="image/jpeg,image/png"
              class="hidden"
              @change="handleAvatarChange"
            />
          </div>

          <!-- 昵称 -->
          <UFormField label="昵称">
            <UInput v-model="profileForm.name" placeholder="输入你的昵称" />
          </UFormField>

          <div class="flex justify-end pt-2">
            <UButton :loading="isSavingProfile" @click="saveProfile">
              保存
            </UButton>
          </div>
        </div>

        <!-- API 配置卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-5">
          <h2 class="text-lg font-medium text-(--ui-text)">API 配置</h2>
          
          <!-- 提示信息 -->
          <div class="flex items-start gap-3 p-3 bg-(--ui-bg-muted) rounded-lg">
            <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-(--ui-text-muted) shrink-0 mt-0.5" />
            <p class="text-sm text-(--ui-text-muted)">
              数据与 API Key 绑定。切换 API Key 后，将使用新 API Key 对应的数据。如果是新的 API Key，将会创建新账号。
            </p>
          </div>

          <!-- API Key 显示 -->
          <UFormField label="API Key">
            <div class="flex items-center gap-2">
              <UInput
                :model-value="maskedApiKey"
                :type="showApiKey ? 'text' : 'password'"
                readonly
                class="flex-1 font-mono"
              />
              <UButton
                variant="ghost"
                size="sm"
                @click="showApiKey = !showApiKey"
              >
                <UIcon :name="showApiKey ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
              </UButton>
            </div>
          </UFormField>
        </div>

        <!-- 余额查询卡片（仅普通用户显示） -->
        <div v-if="user?.role !== 'admin'" class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-5">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-medium text-(--ui-text)">账户余额</h2>
            <UButton
              variant="ghost"
              size="sm"
              :loading="isLoadingBalance"
              @click="loadBalance"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
            </UButton>
          </div>

          <!-- 加载状态 -->
          <div v-if="isLoadingBalance" class="text-center py-4">
            <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-(--ui-text-dimmed) animate-spin" />
          </div>

          <!-- 无余额数据 -->
          <div v-else-if="!balanceData.success" class="text-center py-4">
            <p class="text-sm text-(--ui-text-muted)">{{ balanceData.error || '暂无余额信息' }}</p>
          </div>

          <!-- 无开启余额显示的配置 -->
          <div v-else-if="balanceData.balances.length === 0" class="text-center py-4">
            <p class="text-sm text-(--ui-text-muted)">暂无可查询的余额</p>
          </div>

          <!-- 余额列表 -->
          <div v-else class="space-y-3">
            <div
              v-for="balance in balanceData.balances"
              :key="balance.upstreamId"
              class="flex items-center justify-between p-3 bg-(--ui-bg-muted) rounded-lg"
            >
              <p class="text-base font-medium text-(--ui-text)">{{ profileForm.name || '用户' }}</p>
              <div class="text-right">
                <template v-if="balance.success">
                  <p v-if="balance.unlimitedQuota" class="text-lg font-medium text-green-500">无限额度</p>
                  <p v-else class="text-lg font-medium text-(--ui-text)">{{ formatQuota(balance.quota) }}</p>
                </template>
                <p v-else class="text-sm text-red-500">{{ balance.error || '查询失败' }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 偏好设置卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-5">
          <h2 class="text-lg font-medium text-(--ui-text)">偏好设置</h2>

          <!-- 绘图结果默认模糊 -->
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-sm text-(--ui-text)">绘图结果默认模糊</span>
              <span class="text-xs text-(--ui-text-dimmed)">开启后，新生成的图片会自动模糊显示，防止在公共场合被他人看到</span>
            </div>
            <USwitch v-model="preferencesForm.blurByDefault" />
          </div>

          <!-- 自动压缩参考图 -->
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-sm text-(--ui-text)">自动压缩参考图</span>
              <span class="text-xs text-(--ui-text-dimmed)">开启后，大于 5MB 的参考图会自动压缩，加快上传速度和生成响应</span>
            </div>
            <USwitch v-model="preferencesForm.autoCompressRefImage" />
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <UButton @click="handleSwitchAccount">
              切换账号
            </UButton>
            <UButton :loading="isSaving" @click="savePreferences">
              保存设置
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
