/**
 * 异步任务状态轮询器 - 防并发风暴版
 *
 * 【防并发风暴机制说明】
 *
 * 1. 内存级防重锁 (In-flight Lock)
 *    - 使用 Set<string> 记录当前正在向上游发起 HTTP 请求的 taskId
 *    - 如果 taskId 已在 Set 中，说明上一个请求还没结束，必须跳过
 *    - 请求结束后（无论成功或失败）在 finally 块中移除
 *
 * 2. 按时长退避策略
 *    - 0~30秒任务：至少间隔 5 秒
 *    - 30~90秒任务：至少间隔 8 秒
 *    - 90秒以上任务：至少间隔 10 秒
 *    - 超过 15 分钟未完成：标记为超时异常
 *
 * 3. 并发控制
 *    - 使用 p-limit 控制最大并发数（默认 10 个）
 *    - 禁止无限 Promise.all 并发
 *
 * 4. SSE 推送和状态更新
 *    - 完全保留原有的 syncTaskStatus 逻辑
 *    - 不破坏生图状态更新和前端推送流
 */

import { db } from '../database'
import { tasks, aimodels } from '../database/schema'
import type { Task } from '../database/schema'
import { eq, and, inArray, isNull, lt } from 'drizzle-orm'
import { useTaskService } from './task'
import { getAsyncApiFormats } from './providers'
import pLimit from 'p-limit'

// ============================================================
// 【防并发风暴配置】
// ============================================================

/** 获取需要轮询的异步 API 格式列表 */
const ASYNC_API_FORMATS = getAsyncApiFormats()

/** 全局轮询扫描间隔（毫秒） */
const POLL_INTERVAL_MS = 3 * 1000 // 3秒

/** 单次轮询周期的最大并发数 */
const MAX_CONCURRENT_POLL = 10

/** 任务超时时间（毫秒） - 15 分钟 */
const TASK_TIMEOUT_MS = 15 * 60 * 1000

// ============================================================
// 【1. 内存级防重锁 (In-flight Lock)】
// ============================================================

/**
 * 正在向上游发起 HTTP 请求的 taskId 集合
 * key = String(taskId)
 * 如果 taskId 在此集合中，说明上一个请求还未结束，必须跳过
 */
const activePollingTasks = new Set<string>()

/**
 * 检查任务是否正在被轮询（防重入）
 */
function isTaskPolling(taskId: number): boolean {
  return activePollingTasks.has(String(taskId))
}

/**
 * 标记任务开始轮询
 * @returns true 表示可以继续，false 表示任务正在被其他轮询
 */
function markTaskPolling(taskId: number): boolean {
  const key = String(taskId)
  if (activePollingTasks.has(key)) {
    return false // 已在进行中，跳过
  }
  activePollingTasks.add(key)
  return true
}

/**
 * 标记任务轮询结束（无论成功或失败）
 */
function unmarkTaskPolling(taskId: number): void {
  activePollingTasks.delete(String(taskId))
}

// ============================================================
// 【2. 按时长退避策略】
// ============================================================

/**
 * 根据预估完成时间返回轮询间隔
 * - 0~30秒任务：5 秒间隔（快速轮询）
 * - 30~90秒任务：8 秒间隔（中等轮询）
 * - 90秒以上任务：10 秒间隔（慢速轮询）
 */
function getPollIntervalMs(estimatedTime: number): number {
  if (estimatedTime <= 30) {
    return 5 * 1000 // 5 秒
  } else if (estimatedTime <= 90) {
    return 8 * 1000 // 8 秒
  } else {
    return 10 * 1000 // 10 秒
  }
}

// ============================================================
// 【3. 内存缓存（任务级别退避）】
// ============================================================

/** 任务上次轮询时间缓存 */
const lastPollTimeCache = new Map<number, number>()

/**
 * 获取任务上次轮询时间（优先从缓存读取）
 */
function getLastPollTime(taskId: number): number {
  return lastPollTimeCache.get(taskId) || 0
}

/**
 * 更新任务上次轮询时间
 */
function setLastPollTime(taskId: number): void {
  lastPollTimeCache.set(taskId, Date.now())
}

/**
 * 清理已完成任务的缓存
 */
function cleanupTaskCache(taskId: number): void {
  lastPollTimeCache.delete(taskId)
  unmarkTaskPolling(taskId)
}

// ============================================================
// 【4. 核心轮询逻辑】
// ============================================================

/**
 * 检查任务是否需要本轮轮询
 * 条件：
 * 1. 任务不在防重锁中（未被其他轮询占用）
 * 2. 距离上次轮询已超过退避间隔
 * 3. 任务未超时
 */
async function shouldPollTask(task: Task): Promise<{ shouldPoll: boolean; reason?: string }> {
  // 检查防重锁
  if (isTaskPolling(task.id)) {
    return { shouldPoll: false, reason: '任务正在被其他轮询请求中' }
  }

  // 计算任务已运行时长
  const startedAt = task.startedAt instanceof Date ? task.startedAt : new Date(task.startedAt!)
  const elapsedMs = Date.now() - startedAt.getTime()

  // 检查超时
  if (elapsedMs > TASK_TIMEOUT_MS) {
    return { shouldPoll: false, reason: '任务已超时' }
  }

  // 检查退避间隔
  const aimodel = await db.query.aimodels.findFirst({
    where: eq(aimodels.id, task.aimodelId),
  })
  const estimatedTime = aimodel?.estimatedTime ?? 60 // 默认 60 秒
  const interval = getPollIntervalMs(estimatedTime)

  const lastPoll = getLastPollTime(task.id)
  const timeSinceLastPoll = Date.now() - lastPoll

  if (timeSinceLastPoll < interval) {
    return { shouldPoll: false, reason: `距离上次轮询 ${Math.round(timeSinceLastPoll / 1000)}s，未达到 ${interval / 1000}s 间隔` }
  }

  return { shouldPoll: true }
}

/**
 * 轮询单个任务（核心方法）
 *
 * 【重要】此方法完全保留原有的 syncTaskStatus 逻辑
 * - 调用 taskService.syncTaskStatus() 进行状态同步
 * - 该方法内部会自动：
 *   1. 调用上游 API 查询状态
 *   2. 更新数据库状态
 *   3. 通过 SSE 推送状态更新到前端
 */
async function pollTask(taskId: number): Promise<void> {
  // 【防重锁检查】如果任务正在被轮询，直接跳过
  if (!markTaskPolling(taskId)) {
    console.log(`[TaskPoller] 任务 #${taskId} 正在被其他请求占用，跳过`)
    return
  }

  const taskService = useTaskService()

  try {
    // 调用原有的状态同步方法（保持 SSE 推送不变）
    const task = await taskService.syncTaskStatus(taskId)

    // 更新上次轮询时间
    setLastPollTime(taskId)

    // 如果任务已完成或失败，清理缓存
    if (task && (task.status === 'success' || task.status === 'failed')) {
      cleanupTaskCache(taskId)
      console.log(`[TaskPoller] 任务 #${taskId} 已完成，清理缓存`)
    }
  } catch (error) {
    // 错误时也要清理缓存（任务可能已失败）
    cleanupTaskCache(taskId)
    console.error(`[TaskPoller] 轮询任务 #${taskId} 失败:`, error)
  }
  // 【finally 确保防重锁释放】
  finally {
    unmarkTaskPolling(taskId)
  }
}

/**
 * 处理超时任务
 * 将超过 15 分钟未完成的任务标记为失败
 */
async function handleTimeoutTasks(): Promise<void> {
  const timeoutThreshold = new Date(Date.now() - TASK_TIMEOUT_MS)

  // 查找超时的 processing 任务
  const timeoutTasks = await db.select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, 'processing'),
        inArray(tasks.apiFormat, ASYNC_API_FORMATS),
        isNull(tasks.deletedAt),
        lt(tasks.startedAt, timeoutThreshold)
      )
    )

  if (timeoutTasks.length === 0) return

  console.log(`[TaskPoller] 发现 ${timeoutTasks.length} 个超时任务`)

  const taskService = useTaskService()
  for (const task of timeoutTasks) {
    try {
      await taskService.updateTask(task.id, {
        status: 'failed',
        error: '任务处理超时（超过15分钟未响应）',
      })
      cleanupTaskCache(task.id)
      console.log(`[TaskPoller] 任务 #${task.id} 已标记为超时`)
    } catch (error) {
      console.error(`[TaskPoller] 标记任务 #${task.id} 超时失败:`, error)
    }
  }
}

// ============================================================
// 【5. 主轮询循环 - 带并发控制】
// ============================================================

/**
 * 主轮询循环
 *
 * 流程：
 * 1. 查询所有 processing 状态的任务
 * 2. 过滤出需要本轮轮询的任务（防重锁 + 退避检查）
 * 3. 使用 p-limit 控制并发数
 * 4. 并行执行轮询
 */
async function pollProcessingTasks(): Promise<void> {
  // 查询所有需要轮询的 processing 任务
  const processingTasks = await db.select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, 'processing'),
        inArray(tasks.apiFormat, ASYNC_API_FORMATS),
        isNull(tasks.deletedAt)
      )
    )

  if (processingTasks.length === 0) return

  // 检查每个任务是否需要本轮轮询
  const tasksToPoll: Task[] = []
  const skipReasons: string[] = []

  for (const task of processingTasks) {
    const { shouldPoll, reason } = await shouldPollTask(task)
    if (shouldPoll) {
      tasksToPoll.push(task)
    } else if (reason) {
      skipReasons.push(`#${task.id}: ${reason}`)
    }
  }

  if (skipReasons.length > 0 && tasksToPoll.length > 0) {
    // 只打印部分跳过原因，避免日志过多
    const sampleReasons = skipReasons.slice(0, 3)
    console.log(`[TaskPoller] 本轮跳过 ${skipReasons.length} 个任务，部分原因: ${sampleReasons.join('; ')}`)
  }

  if (tasksToPoll.length === 0) return

  console.log(`[TaskPoller] 本轮轮询 ${tasksToPoll.length} 个任务`)

  // 【并发控制】使用 p-limit 限制最大并发数
  const limit = pLimit(MAX_CONCURRENT_POLL)

  await Promise.all(
    tasksToPoll.map(task =>
      limit(() => pollTask(task.id))
    )
  )

  console.log(`[TaskPoller] 本轮轮询完成`)
}

/**
 * 处理遗留的 submitting 状态任务（进程重启后恢复）
 */
async function recoverSubmittingTasks(): Promise<void> {
  const taskService = useTaskService()

  const submittingTasks = await db.select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, 'submitting'),
        inArray(tasks.apiFormat, ASYNC_API_FORMATS),
        isNull(tasks.deletedAt)
      )
    )

  for (const task of submittingTasks) {
    if (task.upstreamTaskId) {
      // 有上游任务ID，改为 processing 继续轮询
      await taskService.updateTask(task.id, { status: 'processing' })
      console.log(`[TaskPoller] 恢复任务 #${task.id}: submitting -> processing`)
    } else {
      // 无上游任务ID，提交未完成，标记失败
      await taskService.updateTask(task.id, {
        status: 'failed',
        error: '任务提交中断（服务重启）',
      })
      console.log(`[TaskPoller] 任务 #${task.id} 提交未完成，标记为失败`)
    }
  }
}

// ============================================================
// 【6. 启动轮询器】
// ============================================================

/**
 * 启动轮询器
 */
export function startTaskPoller(): void {
  console.log('[TaskPoller] 启动异步任务状态轮询器（防并发风暴版）')
  console.log(`[TaskPoller] 配置: 扫描间隔=${POLL_INTERVAL_MS / 1000}s, 最大并发=${MAX_CONCURRENT_POLL}, 超时时间=15min`)

  // 恢复遗留任务
  recoverSubmittingTasks().catch(err => {
    console.error('[TaskPoller] 恢复遗留任务失败:', err)
  })

  // 启动主定时器
  setInterval(() => {
    pollProcessingTasks().catch(err => {
      console.error('[TaskPoller] 轮询循环错误:', err)
    })
  }, POLL_INTERVAL_MS)

  // 启动超时检测定时器（每分钟检查一次）
  setInterval(() => {
    handleTimeoutTasks().catch(err => {
      console.error('[TaskPoller] 超时检测错误:', err)
    })
  }, 60 * 1000)

  console.log(`[TaskPoller] 定时器已启动，轮询间隔 ${POLL_INTERVAL_MS / 1000}秒，超时检测间隔 60秒`)
}
