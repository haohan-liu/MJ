import { cleanupExpiredConversations } from '../tasks/cleanupExpiredConversations'
import { cleanupExpiredTasks } from '../tasks/cleanupExpiredTasks'

// 定时任务间隔：12 小时
const CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000

export default defineNitroPlugin(() => {
  console.log(`[定时任务] 清理任务已启动，间隔: ${CLEANUP_INTERVAL_MS / 1000 / 60 / 60} 小时`)

  // 定时执行清理任务
  const interval = setInterval(async () => {
    try {
      console.log(`[定时任务] 开始执行清理（当前时间: ${new Date().toLocaleString()}）`)

      // 清理过期临时对话
      const convCount = await cleanupExpiredConversations()
      if (convCount > 0) {
        console.log(`[清理任务] 删除了 ${convCount} 个过期临时对话`)
      }

      // 清理过期任务（文件和数据库标记）
      const stats = await cleanupExpiredTasks()
      console.log(`[清理任务] 清理完成: 任务文件 ${stats.taskLocalFiles + stats.taskCosFiles} 个，参考图 ${stats.uploadLocalFiles + stats.uploadCosFiles} 个，总计 ${stats.total} 个（保留天数: ${stats.retentionDays}，过期时间点: ${new Date(Date.now() - stats.retentionDays * 24 * 60 * 60 * 1000).toLocaleString()}）`)
    } catch (err) {
      console.error('[清理任务] 执行失败:', err)
    }
  }, CLEANUP_INTERVAL_MS)

  // Nitro 关闭时清理定时器
  // @ts-ignore
  if (import.meta.dev) {
    process.on('beforeExit', () => clearInterval(interval))
  }
})
