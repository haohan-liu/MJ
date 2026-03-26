// 用户服务层
import { db } from '../database'
import { users, type User } from '../database/schema'
import { eq } from 'drizzle-orm'

export function useUserService() {
  // 通过邮箱查找用户
  async function findByEmail(email: string): Promise<User | undefined> {
    return db.query.users.findFirst({
      where: eq(users.email, email),
    })
  }

  // 通过用户名查找用户
  async function findByUsername(username: string): Promise<User | undefined> {
    return db.query.users.findFirst({
      where: eq(users.username, username),
    })
  }

  // 通过 API Key 查找用户
  async function findByApiKey(apiKey: string): Promise<User | undefined> {
    return db.query.users.findFirst({
      where: eq(users.apiKey, apiKey),
    })
  }

  // 通过ID查找用户
  async function findById(id: number): Promise<User | undefined> {
    return db.query.users.findFirst({
      where: eq(users.id, id),
    })
  }

  // 创建用户
  async function createUser(data: {
    email?: string
    username?: string
    password?: string // 已哈希的密码（管理员使用）
    name?: string
    apiKey?: string // API Key（用户端使用）
    role?: 'admin' | 'user'
  }): Promise<User> {
    const [user] = await db.insert(users).values({
      email: data.email ?? null,
      username: data.username ?? null,
      password: data.password ?? null,
      name: data.name ?? null,
      apiKey: data.apiKey ?? null,
      role: data.role ?? 'user',
    }).returning()
    if (!user) {
      throw new Error('创建用户失败')
    }
    return user
  }

  return {
    findByEmail,
    findByUsername,
    findByApiKey,
    findById,
    createUser,
  }
}
