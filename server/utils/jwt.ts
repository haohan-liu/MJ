// JWT 工具函数
import { SignJWT, jwtVerify } from 'jose'
import type { H3Event } from 'h3'
import type { AuthUser } from '../../app/shared/types'

export type { AuthUser }

export interface JwtPayload {
  userId: number
  username?: string | null
  email?: string | null
  name: string | null
  role?: string
  purpose: string
}

// 获取 JWT 密钥（从环境变量读取）
function getJwtSecret(): Uint8Array {
  const secret = process.env.NUXT_JWT_SECRET || process.env.NUXT_SESSION_PASSWORD
  if (!secret || secret.length < 32) {
    throw new Error('NUXT_JWT_SECRET 环境变量未设置或长度不足32位')
  }
  return new TextEncoder().encode(secret)
}

// 生成 JWT token
export async function signJwt(payload: JwtPayload, expiresIn: string): Promise<string> {
  const secret = getJwtSecret()

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)

  return token
}

// 验证 JWT token
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)

    return {
      userId: payload.userId as number,
      username: payload.username as string | null | undefined,
      email: payload.email as string | null | undefined,
      name: payload.name as string | null,
      role: payload.role as string | undefined,
      purpose: payload.purpose as string,
    }
  } catch {
    return null
  }
}

// 从请求头获取 token
export function getTokenFromHeader(event: H3Event): string | null {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

// 从 query 参数获取 token（用于 SSE 等不支持 header 的场景）
export function getTokenFromQuery(event: H3Event): string | null {
  const query = getQuery(event)
  return (query.token as string) || null
}

// 从请求中获取用户信息
export async function getUserFromEvent(event: H3Event): Promise<JwtPayload | null> {
  // 优先从 header 获取，其次从 query 参数获取（用于 SSE）
  const token = getTokenFromHeader(event) || getTokenFromQuery(event)
  if (!token) {
    return null
  }
  return verifyJwt(token)
}

// 要求认证（验证失败抛出 401 错误）
// 返回 { user } 格式，兼容原 requireUserSession
export async function requireAuth(event: H3Event): Promise<{ user: AuthUser }> {
  const payload = await getUserFromEvent(event)
  if (!payload) {
    throw createError({
      statusCode: 401,
      message: '未登录或登录已过期',
    })
  }
  return {
    user: {
      id: payload.userId,
      username: payload.username,
      email: payload.email,
      name: payload.name,
      role: (payload.role as 'admin' | 'user') || 'user',
    },
  }
}

// 要求管理员权限（验证失败抛出 401/403 错误）
export async function requireAdmin(event: H3Event): Promise<{ user: AuthUser }> {
  const { user } = await requireAuth(event)
  if (user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: '需要管理员权限',
    })
  }
  return { user }
}

// API Key 认证（MCP 接口和 HTTP API 共用）
// 通过 Bearer Token 验证 API Key，返回用户信息
export async function requireApiKeyAuth(event: H3Event): Promise<{ user: AuthUser }> {
  const token = getTokenFromHeader(event)
  if (!token) {
    throw createError({
      statusCode: 401,
      message: '缺少认证信息',
    })
  }

  // 检查是否为 MCP API Key 格式
  if (!token.startsWith('mjs_')) {
    throw createError({
      statusCode: 401,
      message: '无效的 API Key 格式',
    })
  }

  // 查询数据库验证 Key
  const { eq } = await import('drizzle-orm')
  const { db } = await import('../database')
  const { users } = await import('../database/schema')

  const [user] = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    name: users.name,
    role: users.role,
  }).from(users).where(eq(users.mcpApiKey, token)).limit(1)

  if (!user) {
    throw createError({
      statusCode: 401,
      message: '无效的 API Key',
    })
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  }
}
