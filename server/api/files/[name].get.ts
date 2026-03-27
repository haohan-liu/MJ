// 获取文件（支持 Range 请求，用于视频播放）
// COS 私有桶文件走预签名重定向，本地文件走本地流
import { getFileInfo, createFileStream, readFile } from '../../services/file'
import { getCosSignedUrl, isCosUrl } from '../../services/cosStorage'
import { getStorageType } from '../../services/file'
import { sendStream, sendRedirect } from 'h3'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')

  if (!name) {
    throw createError({
      statusCode: 400,
      message: '缺少文件名称',
    })
  }

  // URL 解码
  const decodedName = decodeURIComponent(name)

  // 获取当前存储类型
  const storageType = await getStorageType()

  // ========================================
  // COS 存储处理
  // ========================================
  if (storageType === 'cos') {
    // 情况1: 明确的 COS key（如 images/2026-03/xxx.png）
    // 情况2: 旧数据（包含 .myqcloud.com 域名）
    // 情况3: 协议相对 URL（//bucket.cos...）
    if (isCosUrl(decodedName) || decodedName.startsWith('images/') || decodedName.startsWith('//')) {
      // 提取 COS key
      let cosKey: string | null = null

      if (isCosUrl(decodedName)) {
        // 从 URL 中提取 key
        cosKey = decodedName.match(/(?:\/\/)?(?:[^/]+\.)?(?:myqcloud\.com|cos\.[^/]+)\/(.+)$/)?.[1] || null
      } else if (decodedName.startsWith('//')) {
        // 协议相对 URL
        cosKey = decodedName.match(/\/\/[^/]+\/(.+)$/)?.[1] || null
      } else {
        // 纯 key
        cosKey = decodedName
      }

      if (cosKey) {
        // 清理 key 中的查询参数
        const cleanKey = cosKey.split(/[?#]/)[0]
        const signedUrl = await getCosSignedUrl(cleanKey, 3600)
        if (signedUrl) {
          console.log(`[Files] COS 预签名重定向: ${cleanKey}`)
          return sendRedirect(event, signedUrl, 302)
        }
      }
    }
  }

  // ========================================
  // 本地存储处理
  // ========================================
  const fileInfo = getFileInfo(decodedName)
  if (!fileInfo) {
    throw createError({
      statusCode: 404,
      message: '文件不存在',
    })
  }

  const { mimeType, size } = fileInfo
  const rangeHeader = getHeader(event, 'range')

  // 如果是 Range 请求（视频播放需要）
  if (rangeHeader) {
    // 解析 Range 请求头：bytes=start-end
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
    if (!match) {
      throw createError({
        statusCode: 416,
        message: 'Invalid Range header',
      })
    }

    const startStr = match[1]
    const endStr = match[2]

    // 处理 Range 边界
    let start = startStr ? parseInt(startStr, 10) : 0
    let end = endStr ? parseInt(endStr, 10) : size - 1

    // 验证范围
    if (start >= size || end >= size) {
      setHeader(event, 'Content-Range', `bytes */${size}`)
      throw createError({
        statusCode: 416,
        message: 'Range Not Satisfiable',
      })
    }

    // 确保 end 不超过文件大小
    if (end > size - 1) {
      end = size - 1
    }

    const chunkSize = end - start + 1

    // 设置响应头
    setResponseStatus(event, 206)
    setHeader(event, 'Content-Type', mimeType)
    setHeader(event, 'Content-Length', chunkSize)
    setHeader(event, 'Content-Range', `bytes ${start}-${end}/${size}`)
    setHeader(event, 'Accept-Ranges', 'bytes')
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

    // 创建文件流并返回
    const stream = createFileStream(decodedName, start, end)
    if (!stream) {
      throw createError({
        statusCode: 500,
        message: '无法创建文件流',
      })
    }

    return sendStream(event, stream)
  }

  // 非 Range 请求，返回完整文件
  // 对于小文件，直接返回 buffer；对于大文件（如视频），使用流式响应
  const isLargeFile = size > 10 * 1024 * 1024 // 10MB

  setHeader(event, 'Content-Type', mimeType)
  setHeader(event, 'Content-Length', size)
  setHeader(event, 'Accept-Ranges', 'bytes')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  if (isLargeFile) {
    // 大文件使用流式响应
    const stream = createFileStream(decodedName)
    if (!stream) {
      throw createError({
        statusCode: 500,
        message: '无法创建文件流',
      })
    }
    return sendStream(event, stream)
  } else {
    // 小文件直接返回 buffer
    const result = readFile(decodedName)
    if (!result) {
      throw createError({
        statusCode: 500,
        message: '读取文件失败',
      })
    }
    return result.buffer
  }
})
