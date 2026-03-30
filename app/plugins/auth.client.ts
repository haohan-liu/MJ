// 客户端认证插件
// 职责：① 从 Cookie 恢复认证状态 ② 为 $fetch 自动附加 Authorization header ③ 拦截 401/403 响应
export default defineNuxtPlugin(() => {
  const { init, getAuthHeader, logout } = useAuth()

  // 初始化：从 Cookie 恢复登录状态
  // 仅在客户端执行，避免 SSR 服务端与客户端状态不一致
  init()

  // 为全局 $fetch 添加拦截器，自动带上 Authorization header
  globalThis.$fetch = $fetch.create({
    onRequest({ options }) {
      const authHeader = getAuthHeader()
      if (authHeader.Authorization) {
        options.headers = {
          ...options.headers,
          ...authHeader,
        }
      }
    },
    onResponseError({ response }) {
      const currentPath = useRoute().path
      // 登录页面自身处理错误提示，不走统一拦截
      const isLoginPage = currentPath === '/login' || currentPath === '/admin-login'

      // 401 时自动登出并跳转登录页
      if (response.status === 401) {
        if (isLoginPage) {
          console.warn('登录请求失败')
        } else {
          const toast = useToast()
          toast.add({ title: '登录已过期，请重新登录', color: 'error' })
          logout()
          navigateTo('/login')
        }
      }

      // 处理其他错误状态码
      if (response.status === 400 || response.status === 403) {
        if (!isLoginPage) {
          const toast = useToast()
          toast.add({ title: response._data?.message || '请求失败', color: 'error' })
        }
      }
    },
  })
})
