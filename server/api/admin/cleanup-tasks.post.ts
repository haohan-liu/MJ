// POST /api/admin/cleanup-tasks - 手动核弹级全量清理（管理员专用）
import { nuclearCleanupByStorage, type NuclearCleanupStats } from '../../tasks/cleanupExpiredTasks'
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
    // ============================================
    // 核弹级全量清理
    // ============================================
    // 行为说明：
    //  - 忽略"保留天数"限制，直接清空当前存储位置（本地 uploads 或 COS 桶）下的所有文件
    //  - local 模式：遍历 uploads/ 目录物理删除所有游离文件，同时标记数据库中所有本地记录的 deleted 标志
    //  - cos 模式：遍历数据库中所有 storage=cos 的记录，逐个调用 COS deleteObject，同时标记数据库
    // 返回：详细的清理统计（本地/COS 任务文件数、本地/COS 参考图数、总计、uploads 目录剩余文件数）
    // ============================================
    const stats: NuclearCleanupStats = await nuclearCleanupByStorage()

    return {
      success: true,
      stats,
      message: `全量清理完成（共删除 ${stats.total} 个文件，存储类型: ${stats.storageType}）`,
    }
  } catch (error) {
    console.error('[NuclearCleanup] 全量清理失败:', error)
    throw createError({
      statusCode: 500,
      message: '清理任务执行失败',
    })
  }
})
