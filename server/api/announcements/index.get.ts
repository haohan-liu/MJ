// GET /api/announcements - 获取公开公告列表（前端展示用）
import { db } from '../../database'
import { announcements } from '../../database/schema'
import { eq, asc, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // 获取启用的公告，按排序字段升序排列
  const list = await db.select()
    .from(announcements)
    .where(eq(announcements.enabled, true))
    .orderBy(asc(announcements.sortOrder), desc(announcements.createdAt))

  return {
    success: true,
    data: list,
  }
})
