// 文件存储服务 - 管理文件的下载、存储和访问
import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, createReadStream, unlinkSync, type ReadStream } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import type { MessageFile } from '../../app/shared/types'
import { getFullResourceUrl } from '../utils/url'
import { useSiteSettingsService } from './siteSettings'
import { SITE_SETTING_KEYS } from '../../app/shared/constants'
import { uploadToCos, deleteFromCos, checkCosFileExists, extractCosKeyFromUrl, inferStorageType, isCosUrl } from './cosStorage'

// 图片压缩配置
const IMAGE_COMPRESSION = {
  maxWidth: 1920,      // 最大宽度
  maxHeight: 1920,     // 最大高度
  maxFileSize: 5 * 1024 * 1024,  // 最大文件大小 5MB
  quality: 85,         // JPEG/WebP 质量
  formats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],  // 需要压缩的图片格式
}

// 文件存储目录
const UPLOAD_DIR = join(process.cwd(), 'uploads')

// 存储类型
type StorageType = 'local' | 'cos'

// 获取当前存储类型
export async function getStorageType(): Promise<StorageType> {
  const siteSettingsService = useSiteSettingsService()
  const type = await siteSettingsService.get(SITE_SETTING_KEYS.STORAGE_TYPE)
  return (type as StorageType) || 'local'
}

// 确保上传目录存在
function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true })
  }
}

// 生成唯一文件名
function generateFileName(data: Buffer | string, ext: string): string {
  const hash = createHash('md5')
    .update(typeof data === 'string' ? data : data)
    .digest('hex')
    .slice(0, 16)
  const timestamp = Date.now().toString(36)
  return `${timestamp}-${hash}.${ext}`
}

// 从扩展名获取 MIME 类型
export function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const mimeTypes: Record<string, string> = {
    // 图片
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    // 文档
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    md: 'text/markdown',
    // 音频
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    // 视频
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    // 代码
    js: 'text/javascript',
    ts: 'text/typescript',
    json: 'application/json',
    html: 'text/html',
    css: 'text/css',
    xml: 'application/xml',
    // 压缩包
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

// 从 MIME 类型获取扩展名
function getExtFromMimeType(mimeType: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'text/plain': 'txt',
    'application/json': 'json',
  }
  return extMap[mimeType] || 'bin'
}

// 从 URL 下载文件并保存到本地
export async function downloadFile(url: string, logPrefix?: string): Promise<string | null> {
  try {
    ensureUploadDir()

    const response = await fetch(url)
    if (!response.ok) {
      console.error(`${logPrefix || '[File]'} 下载失败:`, response.status, url)
      return null
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const mimeTypePart = contentType.split(';')[0]
    let ext = getExtFromMimeType(mimeTypePart || 'application/octet-stream')

    // 如果无法从 Content-Type 识别扩展名，尝试从 URL 路径提取
    if (ext === 'bin') {
      try {
        const urlPath = new URL(url).pathname
        const urlExt = urlPath.split('.').pop()?.toLowerCase()
        if (urlExt && /^[a-z0-9]{2,5}$/.test(urlExt)) {
          ext = urlExt
        }
      } catch {
        // URL 解析失败，保持 bin
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const fileName = generateFileName(buffer, ext)
    const filePath = join(UPLOAD_DIR, fileName)

    writeFileSync(filePath, buffer)
    console.log(`${logPrefix || '[File]'} 已下载: ${fileName}`)

    return fileName
  } catch (error) {
    console.error('[File] 下载文件失败:', error)
    return null
  }
}

// 判断是否需要压缩的图片格式
export function isImageFormat(mimeType: string): boolean {
  return IMAGE_COMPRESSION.formats.includes(mimeType)
}

// 压缩图片
export async function compressImage(data: Buffer, mimeType: string): Promise<Buffer> {
  // 如果不是支持的图片格式，直接返回
  if (!isImageFormat(mimeType)) {
    return data
  }

  // 如果文件大小已经小于限制，直接返回
  if (data.length <= IMAGE_COMPRESSION.maxFileSize) {
    return data
  }

  try {
    let image = sharp(data)
    const metadata = await image.metadata()

    // 如果文件大小小于限制且尺寸也小于限制，直接返回
    if (data.length <= IMAGE_COMPRESSION.maxFileSize) {
      if (!metadata.width || !metadata.height) {
        return data
      }
      if (metadata.width <= IMAGE_COMPRESSION.maxWidth && metadata.height <= IMAGE_COMPRESSION.maxHeight) {
        return data
      }
    }

    // 计算缩放比例
    let resizeOptions: sharp.ResizeOptions | undefined
    if (metadata.width && metadata.height) {
      const widthRatio = IMAGE_COMPRESSION.maxWidth / metadata.width
      const heightRatio = IMAGE_COMPRESSION.maxHeight / metadata.height
      const ratio = Math.min(widthRatio, heightRatio, 1)  // 不放大，只缩小

      if (ratio < 1) {
        resizeOptions = {
          width: Math.round(metadata.width * ratio),
          height: Math.round(metadata.height * ratio),
          fit: 'inside',
          withoutEnlargement: true,
        }
      }
    }

    // 确定输出格式和参数
    let outputImage: sharp.Sharp
    const ext = mimeType.split('/')[1]?.toLowerCase() || 'jpeg'

    if (mimeType === 'image/png') {
      // PNG 转换为 WebP 或 JPEG 以获得更好的压缩效果
      if (resizeOptions) {
        image = image.resize(resizeOptions)
      }
      // PNG 降低质量到合理水平
      outputImage = image.png({ quality: IMAGE_COMPRESSION.quality, compressionLevel: 9 })
    } else if (mimeType === 'image/gif') {
      // GIF 保持原格式，但可以缩放
      if (resizeOptions) {
        image = image.resize(resizeOptions)
      }
      outputImage = image.gif()
    } else {
      // JPEG/WebP 使用质量压缩
      if (resizeOptions) {
        image = image.resize(resizeOptions)
      }
      if (ext === 'webp') {
        outputImage = image.webp({ quality: IMAGE_COMPRESSION.quality })
      } else {
        outputImage = image.jpeg({ quality: IMAGE_COMPRESSION.quality, progressive: true })
      }
    }

    let result = await outputImage.toBuffer()

    // 如果压缩后仍然大于限制，尝试进一步降低质量
    if (result.length > IMAGE_COMPRESSION.maxFileSize) {
      const qualityStep = 10
      let quality = IMAGE_COMPRESSION.quality - qualityStep

      while (quality > 20 && result.length > IMAGE_COMPRESSION.maxFileSize) {
        if (ext === 'webp') {
          result = await sharp(data).resize(resizeOptions).webp({ quality }).toBuffer()
        } else {
          result = await sharp(data).resize(resizeOptions).jpeg({ quality, progressive: true }).toBuffer()
        }
        quality -= qualityStep
      }
    }

    console.log(`[File] 图片压缩: ${(data.length / 1024).toFixed(1)}KB -> ${(result.length / 1024).toFixed(1)}KB (${((1 - result.length / data.length) * 100).toFixed(1)}% 减小)`)
    return result
  } catch (error) {
    console.error('[File] 图片压缩失败，使用原图:', error)
    return data
  }
}

// 保存结果接口
export interface SaveFileResult {
  fileName: string
  mimeType: string
  size: number
}

// 从 Buffer 保存文件（用于 FormData 上传）
export async function saveFile(data: Buffer, originalName: string, mimeType: string): Promise<SaveFileResult | null> {
  try {
    ensureUploadDir()

    // 从原始文件名获取扩展名
    let ext = 'bin'
    const nameParts = originalName.split('.')
    if (nameParts.length > 1) {
      ext = nameParts.pop()!.toLowerCase()
    } else {
      ext = getExtFromMimeType(mimeType)
    }

    // 图片进行压缩
    let processedData = data
    let processedMimeType = mimeType
    if (isImageFormat(mimeType)) {
      processedData = await compressImage(data, mimeType)
      // 如果 PNG 被压缩后变小，转换为 JPEG（更好的兼容性）
      if (mimeType === 'image/png' && processedData.length < data.length * 0.9) {
        // 保持 PNG 格式以支持透明通道
      }
    }

    const fileName = generateFileName(processedData, ext)
    const filePath = join(UPLOAD_DIR, fileName)

    writeFileSync(filePath, processedData)
    console.log('[File] 已保存:', fileName, `(${(processedData.length / 1024).toFixed(1)}KB)`)

    return {
      fileName,
      mimeType: processedMimeType,
      size: processedData.length,
    }
  } catch (error) {
    console.error('[File] 保存文件失败:', error)
    return null
  }
}

// 从 base64 保存文件（支持任意类型）
export function saveBase64File(base64Data: string, originalName?: string): SaveFileResult | null {
  try {
    ensureUploadDir()

    // 解析 data URL: data:[<mediatype>][;base64],<data>
    const matches = base64Data.match(/^data:([^;,]+)(?:;base64)?,(.+)$/)
    if (!matches) {
      console.error('[File] 无效的 base64 格式')
      return null
    }

    const mimeType = matches[1]
    const data = matches[2]
    if (!mimeType || !data) {
      console.error('[File] 无效的 base64 格式')
      return null
    }
    const buffer = Buffer.from(data, 'base64')

    // 从原始文件名或 MIME 类型获取扩展名
    let ext = 'bin'
    if (originalName) {
      const nameParts = originalName.split('.')
      if (nameParts.length > 1) {
        ext = nameParts.pop()!.toLowerCase()
      }
    } else {
      ext = getExtFromMimeType(mimeType)
    }

    const fileName = generateFileName(buffer, ext)
    const filePath = join(UPLOAD_DIR, fileName)

    writeFileSync(filePath, buffer)
    console.log('[File] 已保存:', fileName)

    return {
      fileName,
      mimeType,
      size: buffer.length,
    }
  } catch (error) {
    console.error('[File] 保存文件失败:', error)
    return null
  }
}

// 读取文件
export function readFile(fileName: string): { buffer: Buffer; mimeType: string; size: number } | null {
  try {
    const filePath = join(UPLOAD_DIR, fileName)
    if (!existsSync(filePath)) {
      return null
    }

    const buffer = readFileSync(filePath)
    const mimeType = getMimeType(fileName)
    const stats = statSync(filePath)

    return { buffer, mimeType, size: stats.size }
  } catch (error) {
    console.error('[File] 读取文件失败:', error)
    return null
  }
}

// 获取文件信息（不读取内容）
export function getFileInfo(fileName: string): { mimeType: string; size: number; path: string } | null {
  try {
    const filePath = join(UPLOAD_DIR, fileName)
    if (!existsSync(filePath)) {
      return null
    }

    const mimeType = getMimeType(fileName)
    const stats = statSync(filePath)

    return { mimeType, size: stats.size, path: filePath }
  } catch (error) {
    console.error('[File] 获取文件信息失败:', error)
    return null
  }
}

// 创建文件流（用于 Range 请求）
export function createFileStream(fileName: string, start?: number, end?: number): ReadStream | null {
  try {
    const filePath = join(UPLOAD_DIR, fileName)
    if (!existsSync(filePath)) {
      return null
    }

    const options: { start?: number; end?: number } = {}
    if (start !== undefined) options.start = start
    if (end !== undefined) options.end = end

    return createReadStream(filePath, options)
  } catch (error) {
    console.error('[File] 创建文件流失败:', error)
    return null
  }
}

// 读取文件为 base64
export function readFileAsBase64(fileName: string): string | null {
  const result = readFile(fileName)
  if (!result) return null

  return `data:${result.mimeType};base64,${result.buffer.toString('base64')}`
}

// 检查文件是否存在
export function fileExists(fileName: string): boolean {
  return existsSync(join(UPLOAD_DIR, fileName))
}

// 获取文件的本地 URL 路径
export function getFileUrl(fileName: string): string {
  return `/api/files/${fileName}`
}

// 判断是否为图片类型
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

// ==================== 智能文件处理工具函数 ====================

// 文件大小阈值：超过此大小的文本文件需要用户确认
export const TEXT_FILE_SIZE_THRESHOLD = 20 * 1024 // 20KB

// 判断是否为原生图片类型（SVG 除外，因为 SVG 本质是文本）
export function isNativeImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
}

// 判断是否为 PDF
export function isPdfMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}

// 读取文件为文本内容（用于嵌入消息）
export function readFileAsText(fileName: string): { content: string; size: number } | null {
  const result = readFile(fileName)
  if (!result) return null

  try {
    const content = result.buffer.toString('utf-8')
    return { content, size: result.size }
  } catch {
    return null
  }
}

// 获取文件大小
export function getFileSize(fileName: string): number | null {
  const result = readFile(fileName)
  return result?.size ?? null
}

// ==================== 向后兼容的别名 ====================

/** @deprecated 使用 downloadFile */
export const downloadImage = downloadFile

/** @deprecated 使用 saveBase64File */
export function saveBase64Image(base64Data: string): string | null {
  const result = saveBase64File(base64Data)
  return result?.fileName || null
}

/** @deprecated 使用 readFile */
export const readImage = readFile

/** @deprecated 使用 readFileAsBase64 */
export const readImageAsBase64 = readFileAsBase64

/** @deprecated 使用 fileExists */
export const imageExists = fileExists

/** @deprecated 使用 getFileUrl */
export function getImageUrl(fileName: string): string {
  return `/api/files/${fileName}`
}

/**
 * 从 base64 保存文件并返回包含公网 URL 的 MessageFile
 * 用于对话生图场景，需要将图片 URL 传回给 API
 */
export function saveBase64FileWithUrl(base64Data: string, originalName?: string): MessageFile | null {
  const result = saveBase64File(base64Data, originalName)
  if (!result) return null

  const localUrl = getFileUrl(result.fileName)
  const publicUrl = getFullResourceUrl(localUrl)

  return {
    name: originalName || result.fileName,
    fileName: result.fileName,
    mimeType: result.mimeType,
    size: result.size,
    publicUrl: publicUrl || undefined,
  }
}

/**
 * 提取并保存消息内容中的 base64 图片
 * 用于对话生图场景，检测 AI 返回的 base64 图片并保存到本地
 *
 * @param content 消息内容
 * @returns { newContent: string, files: MessageFile[] } 替换后的内容和保存的文件列表
 */
export function extractAndSaveBase64Images(content: string): { newContent: string; files: MessageFile[] } {
  const files: MessageFile[] = []

  // 匹配 Markdown 图片语法中的 base64 数据
  // 格式: ![alt](data:image/xxx;base64,...)
  const regex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+)\)/g

  const newContent = content.replace(regex, (match, alt, base64Data) => {
    const file = saveBase64FileWithUrl(base64Data)
    if (file) {
      files.push(file)
      // 替换为本地 URL
      const localUrl = getFileUrl(file.fileName)
      console.log(`[File] 提取并保存 base64 图片: ${file.fileName}`)
      return `![${alt || 'image'}](${localUrl})`
    }
    // 保存失败则保留原始内容
    return match
  })

  return { newContent, files }
}

// ==================== 统一存储接口 ====================

/**
 * 统一存储结果
 */
export interface UnifiedSaveResult extends SaveFileResult {
  storage: StorageType
  url: string // 完整访问 URL
}

/**
 * 统一保存文件（根据配置选择本地或 COS）
 * @param buffer 文件内容
 * @param fileName 文件名
 * @param mimeType MIME 类型
 */
export async function saveFileUnified(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UnifiedSaveResult | null> {
  const storageType = await getStorageType()
  
  if (storageType === 'cos') {
    // COS 存储
    const cosKey = `images/${new Date().toISOString().slice(0, 7)}/${fileName}`
    const result = await uploadToCos(buffer, cosKey, mimeType)
    
    if (result) {
      return {
        fileName: cosKey,
        mimeType,
        size: buffer.length,
        storage: 'cos',
        url: result.url,
      }
    }
    
    // COS 上传失败，回退到本地存储
    console.warn('[File] COS 上传失败，回退到本地存储')
  }
  
  // 本地存储
  ensureUploadDir()
  const filePath = join(UPLOAD_DIR, fileName)
  writeFileSync(filePath, buffer)
  console.log('[File] 已保存到本地:', fileName)
  
  return {
    fileName,
    mimeType,
    size: buffer.length,
    storage: 'local',
    url: getFileUrl(fileName),
  }
}



/**
 * 从 base64 统一保存文件（根据站点配置选择 COS 或本地）
 * @param base64Data base64 数据（支持 data URL 格式）
 * @param originalName 原始文件名（可选）
 */
export async function saveBase64FileUnified(
  base64Data: string,
  originalName?: string
): Promise<UnifiedSaveResult | null> {
  try {
    // 解析 data URL: data:[<mediatype>][;base64],<data>
    const matches = base64Data.match(/^data:([^;,]+)(?:;base64)?,(.+)$/)
    if (!matches) {
      console.error('[File] 无效的 base64 格式')
      return null
    }

    const mimeType = matches[1]
    const data = matches[2]
    if (!mimeType || !data) {
      console.error('[File] 无效的 base64 格式')
      return null
    }
    const buffer = Buffer.from(data, 'base64')

    // 从原始文件名或 MIME 类型获取扩展名
    let ext = 'bin'
    if (originalName) {
      const nameParts = originalName.split('.')
      if (nameParts.length > 1) {
        ext = nameParts.pop()!.toLowerCase()
      }
    } else {
      ext = getExtFromMimeType(mimeType)
    }

    const fileName = generateFileName(buffer, ext)
    return await saveFileUnified(buffer, fileName, mimeType)
  } catch (error) {
    console.error('[File] 保存 base64 文件失败:', error)
    return null
  }
}
/**
 * 统一删除文件（根据存储类型删除）
 * @param resourceUrl 资源 URL
 * @param storage 存储类型（可选，URL 特征优先判断）
 */
export async function deleteFileUnified(
  resourceUrl: string,
  storage: StorageType | undefined = 'local'
): Promise<boolean> {
  // 优先根据 URL 特征判断（兜底 storage 字段为空/错误的情况）
  const effectiveStorage = inferStorageType(resourceUrl, storage)

  if (effectiveStorage === 'cos') {
    const key = extractCosKeyFromUrl(resourceUrl)
    if (!key) {
      console.warn('[File] 无法从 URL 提取 COS key，跳过删除:', resourceUrl)
      return false
    }
    console.log('[File] 准备从 COS 删除文件，Key 为:', key)
    // 先验尸：检查 COS 文件是否存在，避免 SDK 对不存在的文件返回 false 而导致幽灵记录被计入删除数
    const exists = await checkCosFileExists(key)
    if (!exists) {
      console.log('[File] COS 文件不存在，跳过删除:', key)
      return false
    }
    return await deleteFromCos(key)
  }

  // 本地文件：尝试多种路径格式
  let fileName = resourceUrl.replace(/^\/uploads\//, '').replace(/^\/api\/files\//, '').replace(/^\//, '')
  const filePath = join(UPLOAD_DIR, fileName)

  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath)
      console.log('[File] 已删除本地文件:', fileName)
      return true
    } catch (error) {
      console.error('[File] 删除本地文件失败:', error)
      return false
    }
  }

  return false
}

/**
 * 检查文件是否存在（根据存储类型）
 * @param resourceUrl 资源 URL
 * @param storage 存储类型（可选，URL 特征优先判断）
 */
export async function checkFileExistsUnified(
  resourceUrl: string,
  storage: StorageType | undefined = 'local'
): Promise<boolean> {
  // 优先根据 URL 特征判断
  const effectiveStorage = inferStorageType(resourceUrl, storage)

  if (effectiveStorage === 'cos') {
    const key = extractCosKeyFromUrl(resourceUrl)
    if (key) {
      return await checkCosFileExists(key)
    }
    return false
  }

  // 本地文件
  const fileName = resourceUrl.replace(/^\/uploads\//, '').replace(/^\/api\/files\//, '').replace(/^\//, '')
  return fileExists(fileName)
}
