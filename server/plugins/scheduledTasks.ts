import { cleanupExpiredConversations } from '../tasks/cleanupExpiredConversations'
import { cleanupExpiredTasks, cleanupExpiredTaskFiles } from '../tasks/cleanupExpiredTasks'

export default defineNitroPlugin(() => {
  // 每 10 分钟执行一次清理任务
  const interval = setInterval(async () => {
    try {
      // 清理过期临时对话
      const convCount = await cleanupExpiredConversations()
      if (convCount > 0) {
        console.log(`[清理任务] 删除了 ${convCount} 个过期临时对话`)
      }
      
      // 清理过期任务（软删除）
      const taskCount = await cleanupExpiredTasks()
      if (taskCount > 0) {
        console.log(`[清理任务] 标记了 ${taskCount} 个过期任务`)
      }
      
      // 清理过期任务文件
      const fileCount = await cleanupExpiredTaskFiles()
      if (fileCount > 0) {
        console.log(`[清理任务] 删除了 ${fileCount} 个过期文件`)
      }
    } catch (err) {
      console.error('[清理任务] 执行失败:', err)
    }
  }, 10 * 60 * 1000) // 10 分钟

  // Nitro 关闭时清理定时器
  // @ts-ignore
  if (import.meta.dev) {
    process.on('beforeExit', () => clearInterval(interval))
  }
})
