// 上传文件
import { saveFileUnified } from '../../services/file'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // 读取 multipart/form-data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      message: '缺少文件数据',
    })
  }

  // 找到文件字段
  const fileField = formData.find(f => f.name === 'file')
  if (!fileField || !fileField.data) {
    throw createError({
      statusCode: 400,
      message: '缺少文件数据',
    })
  }

  // 从原始文件名获取扩展名
  let ext = 'bin'
  const nameParts = (fileField.filename || 'file').split('.')
  if (nameParts.length > 1) {
    ext = nameParts.pop()!.toLowerCase()
  }

  // 生成文件名
  const timestamp = Date.now().toString(36)
  const hash = fileField.data.toString('base64').slice(0, 16)
  const fileName = `${timestamp}-${hash}.${ext}`

  // 使用统一存储（根据站点配置选择本地或 COS）
  const result = await saveFileUnified(fileField.data, fileName, fileField.type || 'application/octet-stream')

  if (!result) {
    throw createError({
      statusCode: 500,
      message: '保存文件失败',
    })
  }

  return {
    success: true,
    fileName: result.fileName,
    url: result.url,  // 统一存储返回正确的 URL（本地路径或 COS URL）
    mimeType: result.mimeType,
    size: result.size,
    storage: result.storage,  // 返回存储类型，方便调试
  }
})
