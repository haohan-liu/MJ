// 启动时自动执行数据库迁移
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from '../database'
import { existsSync } from 'fs'
import { users } from '../database/schema'
import { eq } from 'drizzle-orm'

// 创建默认管理员账号
// 【重要】只检查 role = 'admin'，而不是 username
// 这样修改管理员用户名后不会重复创建账户
async function seedAdminUser() {
  const adminUsername = 'admin'

  // 检查管理员是否已存在（通过 role 检查，而不是 username）
  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
  })

  if (existingAdmin) {
    // 管理员已存在，跳过创建
    console.log(`[DB] 管理员账号已存在 (${existingAdmin.username})`)
    return
  }

  // 没有管理员，创建默认账号（使用 API Key 模式，不需要密码）
  await db.insert(users).values({
    username: adminUsername,
    email: `admin@${Date.now()}.local`,
    name: '管理员',
    role: 'admin',
  })
  console.log('[DB] 默认管理员账号已创建')
}

export default defineNitroPlugin(async () => {
  // 生产环境迁移文件在 /app/server/database/migrations
  // 开发环境迁移文件在 ./server/database/migrations
  const migrationsFolder = existsSync('/app/server/database/migrations')
    ? '/app/server/database/migrations'
    : './server/database/migrations'

  try {
    migrate(db, { migrationsFolder })
    console.log('[DB] 数据库迁移完成')

    // 创建默认管理员账号
    await seedAdminUser()
  } catch (error) {
    console.error('[DB] 数据库迁移失败:', error)
    throw error
  }
})
