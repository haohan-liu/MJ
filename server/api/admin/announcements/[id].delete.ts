// DELETE /api/admin/announcements/:id - 删除公告
import { db } from '../../../database'
import { announcements } from '../../../database/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../../../utils/jwt'

export default defineEventHandler(async (event) => {
  // 验证管理员权限
  const { user } = await requireAuth(event)
  if (user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: '需要管理员权限',
    })
  }

  const id = parseInt(event.context.params?.id || '0')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: '无效的公告ID',
    })
  }

  // 删除公告
  await db.delete(announcements).where(eq(announcements.id, id))

  return {
    success: true,
    message: '公告已删除',
  }
})
