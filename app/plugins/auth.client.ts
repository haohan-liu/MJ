// 客户端认证初始化插件
export default defineNuxtPlugin(() => {
  const { init, getAuthHeader, logout } = useAuth()
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
      const isLoginPage = currentPath === '/login' || currentPath === '/admin-login'

      // 401 时自动登出并跳转登录页
      if (response.status === 401) {
        if (isLoginPage) {
          // 登录页面只记录日志，由页面自身处理错误提示
          console.warn('登录请求失败')
        } else {
          // 非登录页面显示错误并跳转
          const toast = useToast()
          toast.add({ title: '登录已过期，请重新登录', color: 'error' })
          logout()
          navigateTo('/login')
        }
      }

      // 处理其他错误状态码
      if (response.status === 400 || response.status === 403) {
        if (isLoginPage) {
          // 登录页面由页面自身处理，这里只记录
          console.warn('请求参数错误或权限不足')
        }
      }
    },
  })
})
