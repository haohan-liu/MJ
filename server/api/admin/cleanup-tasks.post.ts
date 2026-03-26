// POST /api/admin/cleanup-tasks - 手动触发清理过期任务
import { cleanupExpiredTasks } from '../../tasks/cleanupExpiredTasks'
import { requireAuth } from '../../utils/jwt'

export default defineEventHandler(async (event) => {
  // 验证管理员权限
  const { user } = await requireAuth(event)
  if (user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: '需要管理员权限',
    })
  }

  try {
    const deletedCount = await cleanupExpiredTasks()
    
    return {
      success: true,
      deletedCount,
      message: `已清理 ${deletedCount} 个过期文件`,
    }
  } catch (error) {
    console.error('[Cleanup] 手动清理失败:', error)
    throw createError({
      statusCode: 500,
      message: '清理任务执行失败',
    })
  }
})
