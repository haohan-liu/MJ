// JWT 认证 composable
// 使用 useCookie 实现前后端一致的认证状态管理，支持 SSR
import type { AuthUser } from '../shared/types'

export type { AuthUser }

// Cookie 配置
const TOKEN_COOKIE_KEY = 'auth_token'
const USER_COOKIE_KEY = 'auth_user'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 天（秒）

// 全局状态（内存中的 token，用于快速访问）
const token = ref<string | null>(null)
const user = ref<AuthUser | null>(null)
const isInitialized = ref(false)

// 创建 useCookie（SSR 和客户端均可使用）
function getAuthCookie() {
  return useCookie<string | null>(TOKEN_COOKIE_KEY, {
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax', // 允许跨站点的 GET 请求携带 cookie
  })
}

function getUserCookie() {
  return useCookie<string | null>(USER_COOKIE_KEY, {
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  })
}

// 清空所有用户相关的全局状态
function clearUserData() {
  const stateKeys = [
    'upstreams',
    'available-upstreams',
    'assistants',
    'tasks',
    'mcp-servers',
    'trash-tasks',
    'conversations',
    'messages',
    'conversation-suggestions',
  ]
  for (const key of stateKeys) {
    clearNuxtState(key)
  }
}

export function useAuth() {
  const loggedIn = computed(() => !!token.value && !!user.value)

  // 初始化（从 cookie 恢复状态，SSR 和客户端均可工作）
  function init() {
    if (isInitialized.value) return

    const tokenCookie = getAuthCookie()
    const userCookie = getUserCookie()

    const savedToken = tokenCookie.value ?? null
    const savedUserStr = userCookie.value ?? null

    if (savedToken && savedUserStr) {
      token.value = savedToken
      try {
        user.value = JSON.parse(savedUserStr)
      } catch {
        // JSON 解析失败，清除无效数据
        logout()
      }
    }

    isInitialized.value = true
  }

  // 登录
  function login(newToken: string, newUser: AuthUser) {
    // 清空旧用户数据（切换账号时避免数据混淆）
    clearUserData()

    token.value = newToken
    user.value = newUser

    // 使用 useCookie 设置，SSR 和客户端均可访问
    const tokenCookie = getAuthCookie()
    const userCookie = getUserCookie()
    tokenCookie.value = newToken
    userCookie.value = JSON.stringify(newUser)
  }

  // 登出
  function logout() {
    token.value = null
    user.value = null

    // 清除 cookie
    const tokenCookie = getAuthCookie()
    const userCookie = getUserCookie()
    tokenCookie.value = null
    userCookie.value = null
  }

  // 更新用户信息
  function updateUser(newUser: Partial<AuthUser>) {
    if (user.value) {
      user.value = { ...user.value, ...newUser }
      const userCookie = getUserCookie()
      userCookie.value = JSON.stringify(user.value)
    }
  }

  // 获取 Authorization header（供插件使用）
  function getAuthHeader(): Record<string, string> {
    if (!token.value) return {}
    return { Authorization: `Bearer ${token.value}` }
  }

  return {
    token: readonly(token),
    user: readonly(user),
    loggedIn,
    isInitialized: readonly(isInitialized),
    init,
    login,
    logout,
    updateUser,
    getAuthHeader,
  }
}
