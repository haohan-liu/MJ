// 认证中间件 - 未登录跳转到登录页
// 支持 SSR：服务端和客户端均可执行认证检查
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, isInitialized, init } = useAuth()

  // 确保状态已初始化（从 cookie 恢复）
  if (!isInitialized.value) {
    init()
  }

  // 未登录则重定向到登录页
  if (!loggedIn.value) {
    return navigateTo('/login')
  }
})
