// DELETE /api/tasks/clear-invalid - 清理失效任务
import { db } from '../../database'
import { tasks } from '../../database/schema'
import { and, eq, isNull, sql, or } from 'drizzle-orm'
import { deleteFileUnified } from '../../services/file'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  // 查找失效任务：
  // - failed / cancelled
  // - success 但无产物 URL（空壳）
  // - resourceDeleted：产物文件已从存储清理，界面无图可展示
  const invalidTasks = await db.query.tasks.findMany({
    where: and(
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
    ),
    columns: {
      id: true,
      resourceUrl: true,
      resourceStorage: true,
      images: true,
    },
  })

  console.log(`[ClearInvalid] 找到 ${invalidTasks.length} 个失效任务待清理`)

  // 物理清理遗留文件（防御性，不阻断主流程）
  for (const task of invalidTasks) {
    // 清理主资源文件
    if (task.resourceUrl) {
      try {
        await deleteFileUnified(task.resourceUrl, task.resourceStorage ?? undefined)
      } catch {
        // 静默跳过
      }
    }
    // 清理参考图
    if (task.images && task.images.length > 0) {
      for (const imgUrl of task.images) {
        try {
          await deleteFileUnified(imgUrl)
        } catch {
          // 静默跳过
        }
      }
    }
  }

  // 批量删除失效任务的数据库记录
  if (invalidTasks.length > 0) {
    const taskIds = invalidTasks.map(t => t.id)
    await db.delete(tasks).where(
      sql`${tasks.id} IN (${sql.join(taskIds.map(id => sql`${id}`), sql`, `)})`
    )
  }

  return { success: true, count: invalidTasks.length }
})
