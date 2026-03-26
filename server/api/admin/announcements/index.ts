// 公告管理 API（管理员）
import { db } from '../../../database'
import { announcements } from '../../../database/schema'
import { eq, asc, desc } from 'drizzle-orm'
import { requireAuth } from '../../../utils/jwt'

// GET /api/admin/announcements - 获取所有公告（管理端）
export default defineEventHandler(async (event) => {
  // 验证管理员权限
  const { user } = await requireAuth(event)
  if (user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: '需要管理员权限',
    })
  }

  const method = event.method

  if (method === 'GET') {
    // 获取所有公告
    const list = await db.select()
      .from(announcements)
      .orderBy(asc(announcements.sortOrder), desc(announcements.createdAt))

    return {
      success: true,
      data: list,
    }
  }

  if (method === 'POST') {
    // 创建公告
    const body = await readBody(event)
    const { content, type, icon, link, linkText, enabled, sortOrder } = body

    if (!content) {
      throw createError({
        statusCode: 400,
        message: '公告内容不能为空',
      })
    }

    const now = new Date()
    const [newAnnouncement] = await db.insert(announcements).values({
      content,
      type: type || 'info',
      icon: icon || null,
      link: link || null,
      linkText: linkText || null,
      enabled: enabled ?? true,
      sortOrder: sortOrder || 0,
      createdAt: now,
      updatedAt: now,
    }).returning()

    return {
      success: true,
      data: newAnnouncement,
    }
  }

  throw createError({
    statusCode: 405,
    message: '方法不允许',
  })
})
