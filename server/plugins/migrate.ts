// 启动时自动执行数据库迁移
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from '../database'
import { existsSync } from 'fs'
import { users } from '../database/schema'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../utils/password'

// 创建默认管理员账号
async function seedAdminUser() {
  const adminUsername = 'admin'
  const adminPassword = 'admin123456'

  // 检查管理员是否已存在
  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.username, adminUsername),
  })

  if (!existingAdmin) {
    const hashedPassword = await hashPassword(adminPassword)
    await db.insert(users).values({
      username: adminUsername,
      email: `admin@${Date.now()}.local`, // 提供一个唯一的邮箱以满足数据库约束
      password: hashedPassword,
      name: '管理员',
      role: 'admin',
    })
    console.log('[DB] 默认管理员账号已创建 (admin/admin123456)')
  }
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
