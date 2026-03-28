// 重置管理员账户用户名
// 运行: npx tsx scripts/reset-admin.ts

import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { users } from '../server/database/schema'

const dbPath = './data/mj-studio.db'
const sqlite = new Database(dbPath)
const db = drizzle(sqlite, { schema: { users } })

async function resetAdmin() {
  console.log('=== 重置管理员账户 ===\n')

  // 查找当前管理员
  const currentAdmin = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
  })

  if (!currentAdmin) {
    console.log('未找到管理员账户，退出。')
    sqlite.close()
    return
  }

  console.log(`当前管理员: ID=${currentAdmin.id}, Username=${currentAdmin.username}`)

  // 更新为默认账号
  await db.update(users)
    .set({
      username: 'admin',
    })
    .where(eq(users.id, currentAdmin.id))

  console.log('\n管理员账户已重置为:')
  console.log('  账号: admin')

  sqlite.close()
  console.log('\n重置完成!')
}

resetAdmin().catch(console.error)
