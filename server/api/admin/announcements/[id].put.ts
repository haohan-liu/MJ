// PUT /api/admin/announcements/:id - 更新公告
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

  const body = await readBody(event)
  const { content, type, icon, link, linkText, enabled, sortOrder } = body

  // 检查公告是否存在
  const [existing] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1)
  if (!existing) {
    throw createError({
      statusCode: 404,
      message: '公告不存在',
    })
  }

  // 更新公告
  const [updated] = await db.update(announcements)
    .set({
      content: content ?? existing.content,
      type: type ?? existing.type,
      icon: icon ?? existing.icon,
      link: link ?? existing.link,
      linkText: linkText ?? existing.linkText,
      enabled: enabled ?? existing.enabled,
      sortOrder: sortOrder ?? existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(announcements.id, id))
    .returning()

  return {
    success: true,
    data: updated,
  }
})
