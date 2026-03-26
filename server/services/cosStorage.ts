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
    }, (err) => {
      if (err) {
        console.error('[COS] 上传失败:', err)
        reject(err)
        return
      }
      
      // 只返回 key，不生成签名 URL（签名 URL 有有效期，存入数据库会过期）
      // 需要访问时通过 getCosSignedUrl(key) 动态生成
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
      resolve(data.Url)
    })
  })
}

/**
 * 从 URL 提取 COS key
 * @param url COS 文件 URL（可能带有签名参数）
 */
export function extractCosKeyFromUrl(url: string): string | null {
  // URL 格式: https://bucket.cos.region.myqcloud.com/key?sign=...
  // 需要去除查询参数，只提取 key 部分
  const match = url.match(/\.myqcloud\.com\/([^?]+)/)
  if (match && match[1]) {
    return match[1]
  }
  return null
}
