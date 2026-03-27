// 获取文件（支持 Range 请求，用于视频播放）
// COS 私有桶文件走预签名重定向，本地文件走本地流
// 注意：使用 [...name].get.ts (catch-all) 以支持带斜杠的路径如 images/2026-03/xxx.png
import { getFileInfo, createFileStream, readFile } from '../../services/file'
import { getCosSignedUrl, isCosUrl } from '../../services/cosStorage'
import { getStorageType } from '../../services/file'
import { sendStream, sendRedirect } from 'h3'

export default defineEventHandler(async (event) => {
  // Catch-all 路由参数获取：event.context.params?.name 是 string | string[]
  // Nitro 会将 [...name] 匹配到的路径数组用 / 连接成字符串
  const nameParam = event.context.params?.name

  // 处理可能的数组格式（Nuxt3 某些版本会返回数组）
  const rawName = Array.isArray(nameParam) ? nameParam.join('/') : nameParam

  if (!rawName) {
    throw createError({
      statusCode: 400,
      message: '缺少文件名称',
    })
  }

  // URL 解码（Nuxt Router 会编码斜杠）
  const name = decodeURIComponent(rawName)

  // 获取当前存储类型
  const storageType = await getStorageType()

  // ========================================
  // COS 存储处理
  // ========================================
  if (storageType === 'cos') {
    // 判断是否为 COS 相关路径
    // 1. 明确的 COS key（如 images/2026-03/xxx.png）
    // 2. 旧数据（包含 .myqcloud.com 域名）
    // 3. 协议相对 URL（//bucket.cos...）
    const isCosPath = isCosUrl(name) || name.startsWith('images/') || name.startsWith('//')

    if (isCosPath) {
      // 提取 COS key
      let cosKey: string | null = null

      if (isCosUrl(name)) {
        // 从 URL 中提取 key
        cosKey = name.match(/(?:\/\/)?(?:[^/]+\.)?(?:myqcloud\.com|cos\.[^/]+)\/(.+)$/)?.[1] || null
      } else if (name.startsWith('//')) {
        // 协议相对 URL
        cosKey = name.match(/\/\/[^/]+\/(.+)$/)?.[1] || null
      } else {
        // 纯 key（如 images/2026-03/xxx.png）
        cosKey = name
      }

      if (cosKey) {
        // 清理 key 中的查询参数
        const cleanKey = cosKey.split(/[?#]/)[0]
        console.log(`[Files] COS 请求: ${cleanKey}`)

        // 获取预签名 URL（2小时有效期）
        const signedUrl = await getCosSignedUrl(cleanKey, 7200)
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
  const fileInfo = getFileInfo(name)
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
    const stream = createFileStream(name, start, end)
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
    const stream = createFileStream(name)
    if (!stream) {
      throw createError({
        statusCode: 500,
        message: '无法创建文件流',
      })
    }
    return sendStream(event, stream)
  } else {
    // 小文件直接返回 buffer
    const result = readFile(name)
    if (!result) {
      throw createError({
        statusCode: 500,
        message: '读取文件失败',
      })
    }
    return result.buffer
  }
})
