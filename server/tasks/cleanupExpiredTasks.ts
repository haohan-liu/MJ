import { db } from '../database'
import { tasks, uploadedImages } from '../database/schema'
import { and, isNotNull, sql, eq } from 'drizzle-orm'
import { SITE_SETTING_KEYS } from '../../app/shared/constants'
import { useSiteSettingsService } from '../services/siteSettings'
import { deleteFileUnified } from '../services/file'

/**
 * 清理过期的任务文件（保留任务记录，只删除文件）
 * 将超过保留天数的任务文件删除，但保留任务记录
 * @returns 删除的文件数量
 */
export async function cleanupExpiredTasks(): Promise<number> {
  const siteSettingsService = useSiteSettingsService()
  
  // 获取保留天数配置（默认 30 天）
  const retentionDaysStr = await siteSettingsService.get(SITE_SETTING_KEYS.TASK_RETENTION_DAYS)
  const retentionDays = parseInt(retentionDaysStr || '30', 10)
  
  // 计算过期时间点（Unix 时间戳，秒）
  const expirationTimestamp = Math.floor(Date.now() / 1000) - retentionDays * 24 * 60 * 60
  
  let deletedCount = 0

  // ========== 1. 清理任务结果图 ==========
  const expiredTasksWithFiles = await db.query.tasks.findMany({
    where: and(
      isNotNull(tasks.resourceUrl),
      sql`${tasks.resourceUrl} != ''`,
      sql`${tasks.createdAt} < ${expirationTimestamp}`,
      sql`${tasks.resourceDeleted} IS NULL OR ${tasks.resourceDeleted} = 0`,
    ),
    columns: { id: true, resourceUrl: true, resourceStorage: true },
  })
  
  for (const task of expiredTasksWithFiles) {
    if (!task.resourceUrl) continue
    
    const storage = task.resourceStorage || 'local'
    
    try {
      const success = await deleteFileUnified(task.resourceUrl, storage)
      
      if (success) {
        deletedCount++
        await db.update(tasks)
          .set({ resourceDeleted: true })
          .where(eq(tasks.id, task.id))
      }
    } catch (error) {
      console.error(`[TaskCleanup] 删除任务文件失败: ${task.resourceUrl}`, error)
    }
  }

  // ========== 2. 清理过期参考图（uploaded_images 表） ==========
  const expiredUploads = await db.query.uploadedImages.findMany({
    where: and(
      sql`${uploadedImages.createdAt} < ${expirationTimestamp}`,
      eq(uploadedImages.deleted, false),
    ),
    columns: { id: true, url: true, storage: true },
  })

  for (const upload of expiredUploads) {
    try {
      const success = await deleteFileUnified(upload.url, upload.storage)
      
      if (success) {
        deletedCount++
        await db.update(uploadedImages)
          .set({ deleted: true })
          .where(eq(uploadedImages.id, upload.id))
      } else {
        // 文件不存在也标记为已删除，避免重复尝试
        await db.update(uploadedImages)
          .set({ deleted: true })
          .where(eq(uploadedImages.id, upload.id))
      }
    } catch (error) {
      console.error(`[TaskCleanup] 删除参考图失败: ${upload.url}`, error)
    }
  }
  
  console.log(`[TaskCleanup] 已删除 ${deletedCount} 个过期文件（保留天数: ${retentionDays}）`)
  
  return deletedCount
}

/**
 * 删除过期任务的资源文件（已废弃，逻辑已合并到 cleanupExpiredTasks）
 * @deprecated 使用 cleanupExpiredTasks 代替
 */
export async function cleanupExpiredTaskFiles(): Promise<number> {
  // 逻辑已合并到 cleanupExpiredTasks
  return 0
}
