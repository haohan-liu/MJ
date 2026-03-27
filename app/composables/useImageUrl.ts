/**
 * 图片 URL 格式化工具
 *
 * 智能区分：
 * - 已是完整 URL（http/https 或 data:image/...）→ 直接返回
 * - 本地相对路径（/api/files/... 或 /uploads/...）→ 拼接 runtimeConfig.publicUrl
 */
export function useImageUrl() {
  const config = useRuntimeConfig()

  const publicUrl = computed(() => {
    return (config.publicUrl as string) || ''
  })

  /**
   * 将任意 URL 格式化为浏览器可访问的完整 URL
   * @param url 原始 URL（可能是本地路径、COS URL 或 data:image/...）
   */
  function formatImageUrl(url: string | null | undefined): string {
    if (!url) return ''

    // 已是完整 URL 或 Base64，直接返回
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url
    }

    // 关键防御：识别云存储域名特征，强制补全 https://
    // 覆盖 myqcloud.com（腾讯云 COS）、aliyuncs.com（阿里云 OSS）、amazonaws.com（AWS S3）
    // 识别模式：包含这些域名的字符串，且不是以 / 开头（/ 开头的才是本地路径）
    if (!url.startsWith('/') && (
      url.includes('myqcloud.com') ||
      url.includes('.cos.') ||
      url.includes('aliyuncs.com') ||
      url.includes('amazonaws.com') ||
      url.includes('azureedge.net') ||
      url.includes('cloudfront.net')
    )) {
      // 处理 //bucket.cos... 协议相对 URL
      return url.startsWith('//') ? `https:${url}` : `https://${url}`
    }

    // 本地相对路径：拼接 publicUrl
    const base = publicUrl.value.replace(/\/$/, '')
    const path = url.replace(/^\//, '')
    return `${base}/${path}`
  }

  return {
    publicUrl,
    formatImageUrl,
  }
}
