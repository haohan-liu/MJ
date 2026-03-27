import { readdirSync, unlinkSync, rmdirSync, existsSync } from 'fs'
import { join } from 'path'
import { db } from '../database'
import { tasks, uploadedImages } from '../database/schema'
import { and, isNotNull, sql, eq, lt } from 'drizzle-orm'
import { SITE_SETTING_KEYS } from '../../app/shared/constants'
import { useSiteSettingsService } from '../services/siteSettings'
import { deleteFileUnified, checkFileExistsUnified } from '../services/file'
import { inferStorageType, isCosUrl } from '../services/cosStorage'

/**
 * 清理结果统计
 */
export interface CleanupStats {
  /** 任务结果图（本地） */
  taskLocalFiles: number
  /** 任务结果图（COS） */
  taskCosFiles: number
  /** 参考图（本地） */
  uploadLocalFiles: number
  /** 参考图（COS） */
  uploadCosFiles: number
  /** 总计 */
  total: number
  /** 保留天数 */
  retentionDays: number
}

/**
 * 删除单条文件并更新统计
 * @param url 文件 URL
 * @param storage 数据库记录的 storage 字段
 * @param stats 统计对象
 */
async function deleteAndTrack(
  url: string,
  storage: string | null | undefined,
  stats: CleanupStats,
): Promise<void> {
  // inferStorageType：优先根据 URL 特征判断（COS URL → cos），storage 字段仅作辅助
  const effectiveStorage = inferStorageType(url, storage)
  const isCos = effectiveStorage === 'cos'

  try {
    const deleted = await deleteFileUnified(url, effectiveStorage)
    if (deleted) {
      stats.total++
      if (isCos) {
        stats.taskCosFiles++
      } else {
        stats.taskLocalFiles++
      }
    }
  } catch (err) {
    console.error(`[Cleanup] 删除文件失败: ${url}`, err)
  }
}

// ============================================================================
// 清理过期的任务文件（保留任务记录，只删除文件）
// ============================================================================

/**
 * 清理过期任务结果文件（超过保留天数的任务）
 * - 物理删除文件（本地 / COS）
 * - 保留数据库记录，标记 resourceDeleted = true
 */
export async function cleanupExpiredTasks(): Promise<CleanupStats> {
  const siteSettingsService = useSiteSettingsService()

  const retentionDaysStr = await siteSettingsService.get(SITE_SETTING_KEYS.TASK_RETENTION_DAYS)
  const retentionDays = parseInt(retentionDaysStr || '30', 10)
  const expirationTime = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  const stats: CleanupStats = {
    taskLocalFiles: 0,
    taskCosFiles: 0,
    uploadLocalFiles: 0,
    uploadCosFiles: 0,
    total: 0,
    retentionDays,
  }

  console.log(
    `[Cleanup] 开始清理（保留 ${retentionDays} 天，过期时间点: ${expirationTime.toISOString()}）`,
  )

  // ========================= 任务结果图 =========================
  const expiredTasks = await db.query.tasks.findMany({
    where: and(
      isNotNull(tasks.resourceUrl),
      sql`${tasks.resourceUrl} != ''`,
      lt(tasks.createdAt, expirationTime),
      sql`${tasks.resourceDeleted} IS NULL OR ${tasks.resourceDeleted} = 0`,
    ),
    columns: { id: true, resourceUrl: true, resourceStorage: true },
  })

  console.log(`[Cleanup] 发现 ${expiredTasks.length} 个过期任务文件需要清理`)

  for (const task of expiredTasks) {
    if (!task.resourceUrl) continue

    await deleteAndTrack(task.resourceUrl, task.resourceStorage, stats)

    // 标记数据库（无论物理删除是否成功，都标记以避免重复尝试）
    try {
      await db.update(tasks)
        .set({ resourceDeleted: true })
        .where(eq(tasks.id, task.id))
    } catch {
      // 忽略更新失败
    }
  }

  // ========================= 参考图（uploaded_images 表） =========================
  const expiredUploads = await db.query.uploadedImages.findMany({
    where: and(
      lt(uploadedImages.createdAt, expirationTime),
      eq(uploadedImages.deleted, false),
    ),
    columns: { id: true, url: true, storage: true },
  })

  console.log(`[Cleanup] 发现 ${expiredUploads.length} 个过期参考图需要清理`)

  for (const upload of expiredUploads) {
    const effectiveStorage = inferStorageType(upload.url, upload.storage)
    const isCos = effectiveStorage === 'cos'

    try {
      const deleted = await deleteFileUnified(upload.url, effectiveStorage)
      if (deleted) {
        stats.total++
        if (isCos) {
          stats.uploadCosFiles++
        } else {
          stats.uploadLocalFiles++
        }
      }
    } catch (err) {
      console.error(`[Cleanup] 删除参考图失败: ${upload.url}`, err)
    }

    // 标记数据库
    try {
      await db.update(uploadedImages)
        .set({ deleted: true })
        .where(eq(uploadedImages.id, upload.id))
    } catch {
      // 忽略更新失败
    }
  }

  console.log(
    `[Cleanup] 完成: 本地任务 ${stats.taskLocalFiles} + COS任务 ${stats.taskCosFiles}`
    + ` + 本地参考图 ${stats.uploadLocalFiles} + COS参考图 ${stats.uploadCosFiles}`
    + ` = 总计 ${stats.total}`,
  )

  return stats
}

// ============================================================================
// 强制清理：直接删除所有已标记的过期文件（不检查保留天数）
// ============================================================================

/**
 * 强制清理所有已标记的文件（用于"立即清理"按钮）
 * - 遍历所有 resourceDeleted = true 的任务，物理删除文件
 * - 遍历所有 deleted = true 的参考图，物理删除文件
 */
export async function forceCleanupAllExpired(): Promise<CleanupStats> {
  const siteSettingsService = useSiteSettingsService()

  const retentionDaysStr = await siteSettingsService.get(SITE_SETTING_KEYS.TASK_RETENTION_DAYS)
  const retentionDays = parseInt(retentionDaysStr || '30', 10)

  const stats: CleanupStats = {
    taskLocalFiles: 0,
    taskCosFiles: 0,
    uploadLocalFiles: 0,
    uploadCosFiles: 0,
    total: 0,
    retentionDays,
  }

  console.log('[Cleanup] 执行强制清理（跳过保留天数检查）')

  // ========================= 任务结果图 =========================
  const tasksToClean = await db.query.tasks.findMany({
    where: and(
      isNotNull(tasks.resourceUrl),
      sql`${tasks.resourceUrl} != ''`,
      eq(tasks.resourceDeleted, true),
    ),
    columns: { id: true, resourceUrl: true, resourceStorage: true },
  })

  console.log(`[Cleanup] 发现 ${tasksToClean.length} 个标记为已删除的任务文件`)

  for (const task of tasksToClean) {
    if (!task.resourceUrl) continue

    // inferStorageType 根据 URL 特征兜底判断，解决 storage 字段为空的问题
    const effectiveStorage = inferStorageType(task.resourceUrl, task.resourceStorage)
    const isCos = effectiveStorage === 'cos'

    try {
      const deleted = await deleteFileUnified(task.resourceUrl, effectiveStorage)
      if (deleted) {
        stats.total++
        if (isCos) {
          stats.taskCosFiles++
        } else {
          stats.taskLocalFiles++
        }
        console.log(`[Cleanup] 物理删除任务文件: ${task.resourceUrl} (${effectiveStorage})`)
      } else {
        // 文件不存在（COS 已删除或本地已删除），也视为清理完成
        console.log(`[Cleanup] 文件已不存在，跳过: ${task.resourceUrl}`)
      }
    } catch (err) {
      console.error(`[Cleanup] 物理删除任务文件失败: ${task.resourceUrl}`, err)
    }
  }

  // ========================= 参考图 =========================
  const uploadsToClean = await db.query.uploadedImages.findMany({
    where: eq(uploadedImages.deleted, true),
    columns: { id: true, url: true, storage: true },
  })

  console.log(`[Cleanup] 发现 ${uploadsToClean.length} 个标记为已删除的参考图`)

  for (const upload of uploadsToClean) {
    const effectiveStorage = inferStorageType(upload.url, upload.storage)
    const isCos = effectiveStorage === 'cos'

    try {
      const deleted = await deleteFileUnified(upload.url, effectiveStorage)
      if (deleted) {
        stats.total++
        if (isCos) {
          stats.uploadCosFiles++
        } else {
          stats.uploadLocalFiles++
        }
        console.log(`[Cleanup] 物理删除参考图: ${upload.url} (${effectiveStorage})`)
      } else {
        console.log(`[Cleanup] 参考图已不存在，跳过: ${upload.url}`)
      }
    } catch (err) {
      console.error(`[Cleanup] 物理删除参考图失败: ${upload.url}`, err)
    }
  }

  console.log(
    `[Cleanup] 强制清理完成: 本地任务 ${stats.taskLocalFiles} + COS任务 ${stats.taskCosFiles}`
    + ` + 本地参考图 ${stats.uploadLocalFiles} + COS参考图 ${stats.uploadCosFiles}`
    + ` = 总计 ${stats.total}`,
  )

  return stats
}

// ============================================================================
// 核弹级全量清理：按存储配置全量清空指定位置的文件
// ============================================================================

export interface NuclearCleanupStats {
  /** 本地任务文件数 */
  taskLocalFiles: number
  /** COS 任务文件数 */
  taskCosFiles: number
  /** 本地上传参考图数 */
  uploadLocalFiles: number
  /** COS 上传参考图数 */
  uploadCosFiles: number
  /** 总删除数 */
  total: number
  /** 存储类型 */
  storageType: 'local' | 'cos'
  /** 本地 uploads 目录剩余文件数（仅 local 模式） */
  localRemainingFiles?: number
}

/**
 * ============================================
 * 核弹级清理：全量清空指定存储位置的所有文件
 * ============================================
 *
 * 警告：此函数会忽略所有保留策略！
 * 它根据当前站点配置直接清空该存储位置的所有文件。
 * 仅当管理员主动点击"立即清理过期文件"按钮时调用。
 *
 * 行为：
 *  - local 模式：遍历 uploads/ 目录，删除所有文件；同时遍历数据库该存储的记录并标记
 *  - cos 模式：遍历数据库中所有 storage=cos 的记录，逐个调用 COS deleteObject
 */
export async function nuclearCleanupByStorage(): Promise<NuclearCleanupStats> {
  const UPLOAD_DIR = join(process.cwd(), 'uploads')

  // 获取当前存储配置
  const siteSettingsService = useSiteSettingsService()
  const storageTypeStr = await siteSettingsService.get(SITE_SETTING_KEYS.STORAGE_TYPE)
  const storageType = (storageTypeStr === 'cos' ? 'cos' : 'local') as 'local' | 'cos'

  const stats: NuclearCleanupStats = {
    taskLocalFiles: 0,
    taskCosFiles: 0,
    uploadLocalFiles: 0,
    uploadCosFiles: 0,
    total: 0,
    storageType,
  }

  console.log(`[NuclearCleanup] 核弹级全量清理开始，存储类型: ${storageType}`)

  // ========================= 本地清理 =========================
  if (storageType === 'local') {
    // 1. 遍历 uploads 目录物理删除所有文件（兜底清理游离文件）
    let localFilesDeleted = 0

    if (existsSync(UPLOAD_DIR)) {
      const files = readdirSync(UPLOAD_DIR)
      for (const file of files) {
        const filePath = join(UPLOAD_DIR, file)
        try {
          unlinkSync(filePath)
          localFilesDeleted++
          console.log(`[NuclearCleanup] 删除本地文件: ${file}`)
        } catch (err) {
          console.error(`[NuclearCleanup] 删除本地文件失败: ${file}`, err)
        }
      }
      stats.localRemainingFiles = existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR).length : 0
    }

    // 2. 遍历数据库本地任务，标记 resourceDeleted
    const allLocalTasks = await db.query.tasks.findMany({
      where: and(
        isNotNull(tasks.resourceUrl),
        sql`${tasks.resourceUrl} != ''`,
        sql`(${tasks.resourceStorage} IS NULL OR ${tasks.resourceStorage} = 'local')`,
      ),
      columns: { id: true, resourceUrl: true },
    })

    for (const task of allLocalTasks) {
      try {
        await db.update(tasks)
          .set({ resourceDeleted: true })
          .where(eq(tasks.id, task.id))
      } catch {
        // 忽略
      }
    }
    stats.taskLocalFiles = allLocalTasks.length

    // 3. 遍历数据库本地上传参考图，标记 deleted
    const allLocalUploads = await db.query.uploadedImages.findMany({
      where: sql`(${uploadedImages.storage} IS NULL OR ${uploadedImages.storage} = 'local')`,
      columns: { id: true, url: true },
    })

    for (const upload of allLocalUploads) {
      try {
        await db.update(uploadedImages)
          .set({ deleted: true })
          .where(eq(uploadedImages.id, upload.id))
      } catch {
        // 忽略
      }
    }
    stats.uploadLocalFiles = allLocalUploads.length
    stats.total = localFilesDeleted + stats.taskLocalFiles + stats.uploadLocalFiles

    console.log(
      `[NuclearCleanup] 完成（本地）: 游离文件 ${localFilesDeleted} + 任务记录 ${stats.taskLocalFiles}`
      + ` + 参考图记录 ${stats.uploadLocalFiles} = 总计 ${stats.total}，目录剩余 ${stats.localRemainingFiles} 个文件`,
    )
  }

  // ========================= COS 清理 =========================
  if (storageType === 'cos') {
    // 1. 遍历数据库所有 COS 任务，逐个从 COS 删除并标记
    const allCosTasks = await db.query.tasks.findMany({
      where: and(
        isNotNull(tasks.resourceUrl),
        sql`${tasks.resourceUrl} != ''`,
        eq(tasks.resourceStorage, 'cos'),
      ),
      columns: { id: true, resourceUrl: true },
    })

    for (const task of allCosTasks) {
      if (!task.resourceUrl) continue
      try {
        const deleted = await deleteFileUnified(task.resourceUrl, 'cos')
        if (deleted) stats.taskCosFiles++
        // 即使 COS 删除失败（文件已不存在），也继续标记数据库
        await db.update(tasks)
          .set({ resourceDeleted: true })
          .where(eq(tasks.id, task.id))
      } catch (err) {
        console.error(`[NuclearCleanup] 删除 COS 任务文件失败: ${task.resourceUrl}`, err)
        await db.update(tasks)
          .set({ resourceDeleted: true })
          .where(eq(tasks.id, task.id))
      }
    }

    // 2. 遍历数据库所有 COS 上传参考图，逐个从 COS 删除并标记
    const allCosUploads = await db.query.uploadedImages.findMany({
      where: eq(uploadedImages.storage, 'cos'),
      columns: { id: true, url: true },
    })

    for (const upload of allCosUploads) {
      if (!upload.url) continue
      try {
        const deleted = await deleteFileUnified(upload.url, 'cos')
        if (deleted) stats.uploadCosFiles++
        await db.update(uploadedImages)
          .set({ deleted: true })
          .where(eq(uploadedImages.id, upload.id))
      } catch (err) {
        console.error(`[NuclearCleanup] 删除 COS 参考图失败: ${upload.url}`, err)
        await db.update(uploadedImages)
          .set({ deleted: true })
          .where(eq(uploadedImages.id, upload.id))
      }
    }

    stats.total = stats.taskCosFiles + stats.uploadCosFiles

    console.log(
      `[NuclearCleanup] 完成（COS）: 任务文件 ${stats.taskCosFiles} + 参考图 ${stats.uploadCosFiles}`
      + ` = 总计 ${stats.total}`,
    )
  }

  return stats
}
