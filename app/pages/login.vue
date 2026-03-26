<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { login } = useAuth()
const { loadUpstreams: loadAvailableUpstreams } = useAvailableUpstreams()
const { loadAssistants } = useAssistants()
const toast = useToast()
const { siteName, siteSlogan, apiPlatformUrl, apiPlatformName } = useSiteSettings()

const isLoading = ref(false)

// 密码可见性
const showApiKey = ref(false)

// 用户端表单
const userForm = reactive({
  apiKey: '',
})

// 用户端登录（API Key）
async function handleUserLogin() {
  if (!userForm.apiKey) {
    toast.add({ title: '请输入 API Key', color: 'error' })
    return
  }

  isLoading.value = true
  try {
    const result = await $fetch<{ token: string; user: { id: number; username?: string; name: string | null; role: string } }>('/api/auth/api-key', {
      method: 'POST',
      body: { apiKey: userForm.apiKey },
    })

    login(result.token, result.user)

    // 加载新用户的数据
    await Promise.all([
      loadAvailableUpstreams(),
      loadAssistants(),
    ])

    toast.add({
      title: '登录成功',
      color: 'success',
    })
    
    // 延迟 800 毫秒，让用户看清成功弹窗后再跳转
    await new Promise(resolve => setTimeout(resolve, 800))
    await navigateTo('/')
  } catch (error: any) {
    // 提取错误信息并显示 toast
    const errorMessage = error?.data?.message || error?.message || 'API Key 无效或已过期'
    toast.add({ title: errorMessage, color: 'error' })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg) flex items-center justify-center p-6">
      <div class="w-full max-w-sm">
        <!-- Logo -->
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold text-(--ui-text) mb-2">
            <span class="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {{ siteName }}
            </span>
          </h1>
          <p class="text-(--ui-text-muted)">{{ siteSlogan }}</p>
        </div>

        <!-- 表单卡片 -->
        <div class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-lg p-8 border border-(--ui-border) shadow-2xl">
          <h2 class="text-xl font-semibold text-(--ui-text) mb-6 text-center">
            输入 API Key 开始使用
          </h2>

          <form @submit.prevent="handleUserLogin" class="space-y-5">
            <!-- API Key -->
            <div>
              <label class="block text-(--ui-text-toned) text-sm mb-2 font-medium">API Key</label>
              <div class="relative">
                <input
                  v-model="userForm.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  placeholder="输入您的 API Key"
                  class="w-full px-4 py-3 pr-12 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-(--ui-primary) focus:ring-1 focus:ring-(--ui-primary) transition-colors"
                />
                <button
                  type="button"
                  @click="showApiKey = !showApiKey"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-(--ui-text-muted) hover:text-(--ui-text)"
                >
                  <svg v-if="showApiKey" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- 提交按钮 -->
            <button
              type="submit"
              :disabled="isLoading"
              class="w-full py-3 px-4 rounded-lg font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="isLoading" class="flex items-center justify-center gap-2">
                <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                验证中...
              </span>
              <span v-else>开始使用</span>
            </button>
          </form>

          <p class="mt-4 text-center text-(--ui-text-dimmed) text-sm">
            API Key 用于身份验证和 AI 绘图服务调用
          </p>

          <p v-if="apiPlatformUrl" class="mt-2 text-center text-sm">
            <span class="text-(--ui-text-dimmed)">还没有 API Key？</span>
            <a
              :href="apiPlatformUrl"
              target="_blank"
              class="text-(--ui-primary) hover:opacity-80 ml-1 font-medium"
            >
              前往{{ apiPlatformName }}注册
            </a>
          </p>
        </div>
      </div>
    </div>
</template>
