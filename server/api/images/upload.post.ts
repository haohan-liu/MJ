// 上传图片（支持 FormData 文件上传）
import { saveFileUnified, saveBase64FileUnified, getFileUrl, compressImage, isImageFormat } from '../../services/file'
import { useUserSettingsService } from '../../services/userSettings'
import { USER_SETTING_KEYS } from '../../../app/shared/constants'
import { db } from '../../database'
import { uploadedImages } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const contentType = getHeader(event, 'content-type') || ''

  // 支持 FormData 文件上传
  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        message: '缺少图片文件',
      })
    }

    const file = formData.find(f => f.name === 'file')
    if (!file || !file.data) {
      throw createError({
        statusCode: 400,
        message: '缺少图片文件',
      })
    }

    // 获取用户的自动压缩设置
    const settingsService = useUserSettingsService()
    const shouldCompress = await settingsService.get<boolean>(user.id, USER_SETTING_KEYS.GENERAL_AUTO_COMPRESS_REF_IMAGE)

    // 处理图片数据（根据设置决定是否压缩）
    let processedData = file.data
    const mimeType = file.type || 'image/png'
    if (shouldCompress && isImageFormat(mimeType)) {
      processedData = await compressImage(file.data, mimeType)
    }

    // 使用统一存储接口（根据站点配置选择 COS 或本地）
    const result = await saveFileUnified(processedData, file.filename || 'image.png', mimeType)
    if (!result) {
      throw createError({
        statusCode: 500,
        message: '保存图片失败',
      })
    }

    // 记录上传文件（用于过期清理）
    await db.insert(uploadedImages).values({
      userId: user.id,
      fileName: result.fileName,
      url: result.url,
      storage: result.storage,
      createdAt: new Date(),
    })

    return {
      success: true,
      fileName: result.fileName,
      url: result.url,
      storage: result.storage,
    }
  }

  // 向后兼容：支持 JSON body 中的 base64
  const body = await readBody(event)
  const { base64 } = body

  if (!base64) {
    throw createError({
      statusCode: 400,
      message: '缺少图片数据',
    })
  }

  // 使用统一存储接口
  const result = await saveBase64FileUnified(base64)
  if (!result) {
    throw createError({
      statusCode: 500,
      message: '保存图片失败',
    })
  }

  // 记录上传文件（用于过期清理）
  await db.insert(uploadedImages).values({
    userId: user.id,
    fileName: result.fileName,
    url: result.url,
    storage: result.storage,
    createdAt: new Date(),
  })

  return {
    success: true,
    fileName: result.fileName,
    url: result.url,
    storage: result.storage,
  }
})
