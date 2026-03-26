// GET /api/user/balance - 查询用户在所有开启余额显示的上游平台的余额
import { useUpstreamService } from '../../services/upstream'
import { queryBalance } from '../../services/balance'
import { db } from '../../database'
import { users, upstreams } from '../../database/schema'
import { eq, and } from 'drizzle-orm'
import type { UpstreamPlatform } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)

  // 获取当前用户的 API Key
  const [currentUser] = await db.select({ apiKey: users.apiKey }).from(users).where(eq(users.id, user.id)).limit(1)
  
  if (!currentUser?.apiKey) {
    return { 
      success: false, 
      error: '您还未配置 API Key',
      balances: [] 
    }
  }

  // 获取所有开启用户余额显示的上游配置
  const upstreamService = useUpstreamService()
  const allUpstreams = await upstreamService.getAllSimple()
  
  // 过滤出开启余额显示且有平台类型的配置
  const balanceUpstreams = allUpstreams.filter(u => 
    u.showUserBalance && u.upstreamPlatform && !u.disabled
  )

  // 并发查询所有余额
  const balancePromises = balanceUpstreams.map(async (upstream) => {
    const result = await queryBalance(
      upstream.baseUrl,
      currentUser.apiKey!,
      upstream.upstreamPlatform as UpstreamPlatform
    )
    
    return {
      upstreamId: upstream.id,
      upstreamName: upstream.name,
      platform: upstream.upstreamPlatform,
      success: result.success,
      quota: result.upstreamInfo?.quota,
      usedQuota: result.upstreamInfo?.usedQuota,
      unlimitedQuota: result.upstreamInfo?.unlimitedQuota,
      error: result.error,
    }
  })

  const balances = await Promise.all(balancePromises)

  return {
    success: true,
    balances,
  }
})
