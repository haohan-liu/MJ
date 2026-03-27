/**
 * 图片 URL 格式化工具
 *
 * 核心目标：生成包含域名的绝对路径，迫使浏览器直接发起网络请求，
 * 从而彻底绕过 Vue Router 的路由拦截。
 *
 * 规则：
 * - 已是有效外链（http:// 或 https://）或 base64 → 直接返回
 * - 其他所有情况 → 强制组装为 http(s)://域名/api/files/[路径]
 *
 * 关键设计：
 * - 使用 window.location.origin 确保绝对路径正确
 * - 存储层只存相对路径（images/2026-03/xxx.png），预签名逻辑在后端代理中
 * - 前端无需关心 URL 是本地文件还是 COS key，全部走 /api/files/ 路由
 */
export function useImageUrl() {
  /**
   * 将任意 URL 格式化为带域名的绝对路径
   *
   * @param url 原始 URL（可能是相对路径、本地路径、或 COS key）
   */
  function formatImageUrl(url: string | null | undefined): string {
    if (!url) return ''

    // 已经是有效外链或 base64 → 直接返回
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url
    }

    // 剥离可能存在的冗余前缀和斜杠
    let cleanUrl = url.replace(/^\//, '')
    if (cleanUrl.startsWith('api/files/')) {
      cleanUrl = cleanUrl.replace(/^api\/files\//, '')
    }

    // 强制组装为带有 http/https 的绝对路径
    // 使用 window.location.origin 确保浏览器直接发起网络请求，绕过 Vue Router
    let baseUrl = ''
    if (typeof window !== 'undefined') {
      baseUrl = window.location.origin
    }
    // 兜底：尝试从 runtimeConfig 获取
    if (!baseUrl) {
      try {
        const config = useRuntimeConfig()
        baseUrl = (config.publicUrl as string) || ''
      } catch {
        baseUrl = ''
      }
    }

    const cleanBase = baseUrl.replace(/\/$/, '')

    return `${cleanBase}/api/files/${cleanUrl}`
  }

  return {
    formatImageUrl,
  }
}
