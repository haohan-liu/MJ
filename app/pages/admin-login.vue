<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { login } = useAuth()
const { loadUpstreams: loadAvailableUpstreams } = useAvailableUpstreams()
const { loadAssistants } = useAssistants()
const toast = useToast()
const { siteName, siteSlogan } = useSiteSettings()

const isLoading = ref(false)
const showPassword = ref(false)

const form = reactive({
  username: '',
  password: '',
})

async function handleLogin() {
  if (!form.username) {
    toast.add({ title: '请输入用户名', color: 'error' })
    return
  }
  if (!form.password) {
    toast.add({ title: '请输入密码', color: 'error' })
    return
  }

  isLoading.value = true
  try {
    const result = await $fetch<{
      token: string
      user: { id: number; username?: string; name: string | null; role: string }
    }>('/api/auth/admin-login', {
      method: 'POST',
      body: { username: form.username, password: form.password },
    })

    // 验证是否为管理员（双重保险，由后端已校验）
    if (result.user.role !== 'admin') {
      toast.add({
        title: '权限不足',
        description: '此页面仅限管理员访问',
        color: 'error',
      })
      return
    }

    login(result.token, result.user)

    await Promise.all([
      loadAvailableUpstreams(),
      loadAssistants(),
    ])

    toast.add({
      title: '管理员登录成功',
      color: 'success',
    })

    await new Promise(resolve => setTimeout(resolve, 800))
    await navigateTo('/settings')
  } catch (error: any) {
    const errorMessage = error?.data?.message || error?.message || '用户名或密码错误'
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
          <span class="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
            {{ siteName }}
          </span>
        </h1>
        <p class="text-(--ui-text-muted)">{{ siteSlogan }}</p>
      </div>

      <!-- 管理员登录卡片 -->
      <div class="bg-(--ui-bg-elevated) backdrop-blur-sm rounded-lg p-8 border border-(--ui-border) shadow-2xl">
        <!-- 管理员标识 -->
        <div class="flex items-center justify-center gap-2 mb-6">
          <div class="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <h2 class="text-xl font-semibold text-(--ui-text) mb-1 text-center">
          管理员登录
        </h2>
        <p class="text-(--ui-text-dimmed) text-sm mb-6 text-center">
          请输入管理员账号信息
        </p>

        <form @submit.prevent="handleLogin" class="space-y-5">
          <!-- 用户名 -->
          <div>
            <label class="block text-(--ui-text-toned) text-sm mb-2 font-medium">用户名</label>
            <input
              v-model="form.username"
              type="text"
              placeholder="输入管理员用户名"
              class="w-full px-4 py-3 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            />
          </div>

          <!-- 密码 -->
          <div>
            <label class="block text-(--ui-text-toned) text-sm mb-2 font-medium">密码</label>
            <div class="relative">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="输入密码"
                class="w-full px-4 py-3 pr-12 rounded-lg bg-(--ui-bg-muted) border border-(--ui-border) text-(--ui-text) placeholder-(--ui-text-dimmed) focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-(--ui-text-muted) hover:text-(--ui-text)"
              >
                <svg v-if="showPassword" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            class="w-full py-3 px-4 rounded-lg font-medium text-white bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading" class="flex items-center justify-center gap-2">
              <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              验证中...
            </span>
            <span v-else>登录</span>
          </button>
        </form>

        <!-- 返回用户登录 -->
        <div class="mt-6 pt-6 border-t border-(--ui-border)">
          <p class="text-center text-(--ui-text-dimmed) text-sm">
            普通用户？
            <a
              href="/login"
              class="text-purple-500 hover:opacity-80 font-medium"
            >
              用户登录
            </a>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
