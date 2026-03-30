// POST /api/auth/admin-login - 管理员账号密码登录
import { db } from '../../database'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword } from '../../utils/password'
import { signJwt } from '../../utils/jwt'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, password } = body

  // 验证输入
  if (!username) {
    throw createError({
      statusCode: 400,
      message: '请输入用户名',
    })
  }

  if (!password) {
    throw createError({
      statusCode: 400,
      message: '请输入密码',
    })
  }

  // 查询用户（根据 username）
  const [user] = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    password: users.password,
    name: users.name,
    avatar: users.avatar,
    role: users.role,
  }).from(users).where(eq(users.username, username)).limit(1)

  // 用户不存在
  if (!user) {
    throw createError({
      statusCode: 401,
      message: '用户名或密码错误',
    })
  }

  // 检查是否为管理员
  if (user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: '权限不足，仅限管理员访问',
    })
  }

  // 验证密码
  const isPasswordValid = await verifyPassword(user.password, password)
  if (!isPasswordValid) {
    throw createError({
      statusCode: 401,
      message: '用户名或密码错误',
    })
  }

  // 生成 JWT token
  const token = await signJwt({
    userId: user.id,
    username: user.username,
    email: user.email,
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
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
    },
  }
})
