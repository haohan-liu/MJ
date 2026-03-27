// 腾讯云 COS 存储服务
import COS from 'cos-nodejs-sdk-v5'
import { useSiteSettingsService } from '../services/siteSettings'
import { SITE_SETTING_KEYS } from '../../app/shared/constants'

export interface CosConfig {
  secretId: string
  secretKey: string
  bucket: string
  region: string
}

export interface UploadResult {
  url: string
  key: string
}

// 获取 COS 配置
async function getCosConfig(): Promise<CosConfig | null> {
  const siteSettingsService = useSiteSettingsService()
  
  const secretId = await siteSettingsService.get(SITE_SETTING_KEYS.COS_SECRET_ID)
  const secretKey = await siteSettingsService.get(SITE_SETTING_KEYS.COS_SECRET_KEY)
  const bucket = await siteSettingsService.get(SITE_SETTING_KEYS.COS_BUCKET)
  const region = await siteSettingsService.get(SITE_SETTING_KEYS.COS_REGION)
  
  if (!secretId || !secretKey) {
    return null
  }
  
  return {
    secretId,
    secretKey,
    bucket: bucket || 'new-api-1301453074',
    region: region || 'ap-guangzhou',
  }
}

// 创建 COS 客户端
function createCosClient(config: CosConfig): COS {
  return new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  })
}

/**
 * 上传文件到 COS
 * @param buffer 文件内容（Buffer）
 * @param key 文件路径（如 images/2024/01/xxx.png）
 * @param mimeType 文件 MIME 类型
 */
export async function uploadToCos(
  buffer: Buffer,
  key: string,
  mimeType: string = 'image/png'
): Promise<UploadResult | null> {
  const config = await getCosConfig()
  if (!config) {
    console.error('[COS] 配置不完整，无法上传')
    return null
  }

  const cos = createCosClient(config)

  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }, (err, data) => {
      if (err) {
        console.error('[COS] 上传失败:', err)
        reject(err)
        return
      }

      // 数据库和所有调用方统一存 key（相对路径），不在这里拼接 https://
      // 读取时由 resolveResourceUrl 统一用 getCosSignedUrl 构造带签名的完整外链
      console.log('[COS] 已上传:', key)
      resolve({ url: key, key })
    })
  })
}

/**
 * 删除 COS 文件
 * @param key 文件路径
 */
export async function deleteFromCos(key: string): Promise<boolean> {
  const config = await getCosConfig()
  if (!config) {
    console.error('[COS] 配置不完整，无法删除')
    return false
  }
  
  const cos = createCosClient(config)
  
  return new Promise((resolve) => {
    cos.deleteObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    }, (err) => {
      if (err) {
        console.error('[COS] 删除失败:', err)
        resolve(false)
        return
      }
      console.log('[COS] 已删除文件:', key)
      resolve(true)
    })
  })
}

/**
 * 检查 COS 文件是否存在
 * @param key 文件路径
 */
export async function checkCosFileExists(key: string): Promise<boolean> {
  const config = await getCosConfig()
  if (!config) {
    return false
  }
  
  const cos = createCosClient(config)
  
  return new Promise((resolve) => {
    cos.headObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    }, (err) => {
      resolve(!err)
    })
  })
}

/**
 * 获取 COS 文件的临时访问 URL（带签名）
 * @param key 文件路径
 * @param expires 过期时间（秒），默认 1 小时
 */
export async function getCosSignedUrl(key: string, expires: number = 3600): Promise<string | null> {
  const config = await getCosConfig()
  if (!config) {
    return null
  }
  
  const cos = createCosClient(config)
  
  return new Promise((resolve) => {
    cos.getObjectUrl({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Sign: true,
      Expires: expires,
    }, (err, data) => {
      if (err) {
        console.error('[COS] 获取签名URL失败:', err)
        resolve(null)
        return
      }
      // 强制补全协议头，防止 SDK 返回 //bucket.cos... 导致前端无法渲染
      resolve(ensureHttpsUrl(data.Url))
    })
  })
}

/**
 * 从 URL 提取 COS key
 * @param urlOrKey COS 文件 URL（可能带有签名参数），或直接的 key（相对路径）
 * @returns 提取到的 key，或 null
 */
export function extractCosKeyFromUrl(urlOrKey: string): string | null {
  if (!urlOrKey) return null

  // 如果不是以 http:// 或 https:// 开头，说明已经是纯净的相对路径（key）
  // 直接返回，不做任何 URL 解析
  if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
    return urlOrKey
  }

  // 以下处理完整的 COS URL：
  // 1. https://bucket.cos.region.myqcloud.com/key
  // 2. //bucket.cos.region.myqcloud.com/key   （协议相对，SDK 返回）
  // 3. bucket.cos.region.myqcloud.com/key      （裸域名）
  // 4. //bucket.myqcloud.com/key                （旧格式或 CDN）
  // 5. https://cos.xxx.com/key                 （自定义 CDN 域名）
  // 6. https://bucket-appid.cos.ap-guangzhou.myqcloud.com/key
  // 支持 ?sign=... 或 #... 等尾部参数
  const match = urlOrKey.match(/(?:\/\/)?(?:[^/]+\.)?(?:myqcloud\.com|cos\.[^/]+)\/(.+)$/)
  if (match && match[1]) {
    return decodeURIComponent(match[1].split(/[?#]/)[0])
  }

  return null
}

/**
 * 确保 URL 带有协议头
 * COS SDK 或 CDN 返回的 URL 可能缺少 https://，导致前端无法渲染
 */
export function ensureHttpsUrl(url: string): string {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}

/**
 * 判断 URL 是否为 COS 地址
 * @param url 资源 URL
 */
export function isCosUrl(url: string): boolean {
  if (!url) return false
  return url.includes('.myqcloud.com')
}

/**
 * 从资源 URL 和 storage 字段推断真实的存储类型
 * 优先根据 URL 特征判断（不受数据库 storage 字段为空/错误的影响）
 * @param resourceUrl 资源 URL
 * @param storage 数据库记录的 storage 字段
 */
export function inferStorageType(
  resourceUrl: string,
  storage: string | null | undefined
): 'local' | 'cos' {
  // URL 明确是 COS，直接返回 cos（兜底判断，覆盖 storage 字段为空/错误的情况）
  if (isCosUrl(resourceUrl)) {
    return 'cos'
  }
  // 其他情况信任 storage 字段（本地或其他）
  return (storage === 'cos') ? 'cos' : 'local'
}
