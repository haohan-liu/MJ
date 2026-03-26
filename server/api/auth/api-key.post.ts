// POST /api/auth/api-key - 用户端 API Key 登录
import { useUserService } from '../../services/user'
import { signJwt } from '../../utils/jwt'
import { validateApiKey } from '../../utils/api-key-validator'
import { db } from '../../database'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { apiKey } = body

  // 验证输入
  if (!apiKey) {
    throw createError({
      statusCode: 400,
      message: '请输入 API Key',
    })
  }

  // 验证 API Key
  const validationResult = await validateApiKey(apiKey)

  if (!validationResult.valid) {
    throw createError({
      statusCode: 401,
      message: validationResult.error || 'API Key 无效',
    })
  }

  const userService = useUserService()

  // 查找或创建用户
  let user = await userService.findByApiKey(apiKey)

  if (!user) {
    // 创建新用户（API Key 用户）
    const name = validationResult.name || '用户'
    user = await userService.createUser({
      apiKey,
      name,
      role: 'user',
    })
  }

  // 更新用户的 API Key 信息（如果验证结果有变化）
  if (validationResult.name && user.name !== validationResult.name) {
    await db.update(users)
      .set({ name: validationResult.name })
      .where(eq(users.id, user.id))
    user = { ...user, name: validationResult.name }
  }

  // 生成 JWT token
  const token = await signJwt({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    purpose: 'auth',
  }, '30d')

  return {
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    },
  }
})
