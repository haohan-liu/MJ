// GET /api/tasks/invalid-count - 获取失效任务数量
import { db } from '../../database'
import { tasks } from '../../database/schema'
import { and, eq, isNull, sql, or } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  // 统计失效任务：
  // - failed / cancelled
  // - success 但无产物 URL（空壳）
  // - resourceDeleted：产物文件已从存储清理，界面无图可展示
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, user.id),
        isNull(tasks.deletedAt),
        or(
          eq(tasks.status, 'failed'),
          eq(tasks.status, 'cancelled'),
          eq(tasks.resourceDeleted, true),
          and(
            eq(tasks.status, 'success'),
            sql`(${tasks.resourceUrl} IS NULL OR ${tasks.resourceUrl} = '')`
          )
        )
      )
    )

  return { count: result[0]?.count ?? 0 }
})
