// GET /api/upstreams/[id]/balance - 查询指定配置的 API Key 余额
import { useUpstreamService } from '../../../services/upstream'
import { queryBalance } from '../../../services/balance'
import { db } from '../../../database'
import { users } from '../../../database/schema'
import { eq } from 'drizzle-orm'
import type { UpstreamPlatform } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, message: '无效的配置ID' })
  }

  const upstreamService = useUpstreamService()
  const upstream = await upstreamService.getByIdSimple(id)

  if (!upstream) {
    throw createError({ statusCode: 404, message: '配置不存在' })
  }

  // 检查是否开启了用户余额显示
  if (!upstream.showUserBalance) {
    return { success: false, error: '该配置未开启用户余额显示' }
  }

  // 检查是否配置了余额查询类型
  if (!upstream.upstreamPlatform) {
    return { success: false, error: '该配置未设置余额查询类型' }
  }

  // 获取当前用户的 API Key
  const [currentUser] = await db.select({ apiKey: users.apiKey }).from(users).where(eq(users.id, user.id)).limit(1)
  
  if (!currentUser?.apiKey) {
    return { success: false, error: '您还未配置 API Key，请在用户设置中配置' }
  }

  const result = await queryBalance(
    upstream.baseUrl,
    currentUser.apiKey,
    upstream.upstreamPlatform as UpstreamPlatform
  )

  // 注意：不再保存 upstreamInfo 到数据库，因为每个用户的余额不同

  return result
})
