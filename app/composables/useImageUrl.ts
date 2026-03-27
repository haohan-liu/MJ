/**
 * 图片 URL 格式化工具
 *
 * 原则：只做路径拼接，不做云存储域名检测
 * - 已是完整 URL（http/https 或 data:image/...）→ 直接返回
 * - 其他所有情况 → 统一拼接为 [baseUrl]/api/files/[相对路径]
 *
 * 注意：云存储（COS）的预签名逻辑在后端 /api/files/[name].get.ts 中统一处理，
 * 前端无需关心 URL 是本地文件还是 COS key，全部走同一路由即可。
 */
export function useImageUrl() {
  const config = useRuntimeConfig()

  const publicUrl = computed(() => {
    return (config.publicUrl as string) || ''
  })

  /**
   * 将任意 URL 格式化为浏览器可访问的完整 URL
   *
   * 路由规则：
   * - `http://...` / `https://...` / `data:image/...` → 直接返回
   * - `/api/files/xxx`（本地存储的 result.url）→ 拼接 base
   * - `images/2026-03/xxx.png`（相对路径，COS key）→ /api/files/images/2026-03/xxx.png
   * - `//bucket.cos...`（协议相对 URL，来自 COS SDK）→ 补全 https://
   *
   * @param url 原始 URL
   */
  function formatImageUrl(url: string | null | undefined): string {
    if (!url) return ''

    // 已是完整 URL 或 Base64 → 直接返回
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url
    }

    // 协议相对 URL（如 //bucket.cos...，COS SDK 返回格式）→ 补全 https://
    if (url.startsWith('//')) {
      return `https:${url}`
    }

    // 相对路径统一走 /api/files/ 路由
    const base = publicUrl.value.replace(/\/$/, '')
    const path = url.replace(/^\//, '')

    // 如果已经是 /api/files/ 开头（本地存储的 result.url），直接拼接 base
    // 避免双重前缀：/api/files/filename.png → base/api/files/filename.png
    if (path.startsWith('api/files/')) {
      return `${base}/${path}`
    }

    // 否则添加前缀（COS 存的是 images/... 相对路径，或上传后的纯文件名）
    return `${base}/api/files/${path}`
  }

  return {
    publicUrl,
    formatImageUrl,
  }
}
