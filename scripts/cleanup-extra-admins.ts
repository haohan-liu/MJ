// 清理多余管理员账户的临时脚本
// 运行: npx tsx scripts/cleanup-extra-admins.ts

import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { users } from '../server/database/schema'

const dbPath = './data/mj-studio.db'
const sqlite = new Database(dbPath)
const db = drizzle(sqlite, { schema: { users } })

async function cleanupExtraAdmins() {
  console.log('=== 清理多余管理员账户 ===\n')

  // 查找所有管理员
  const allAdmins = await db.select().from(users).where(eq(users.role, 'admin'))

  console.log(`找到 ${allAdmins.length} 个管理员账户:`)
  allAdmins.forEach((admin, i) => {
    console.log(`  ${i + 1}. ID: ${admin.id}, Username: ${admin.username}, Email: ${admin.email}, Created: ${admin.createdAt}`)
  })

  if (allAdmins.length <= 1) {
    console.log('\n管理员账户数量正常，无需清理。')
    sqlite.close()
    return
  }

  // 保留最早创建的那个（通常是原始管理员）
  const sortedAdmins = [...allAdmins].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return aTime - bTime
  })

  const keepAdmin = sortedAdmins[0]
  const deleteAdmins = sortedAdmins.slice(1)

  console.log(`\n将保留管理员: ${keepAdmin.username} (ID: ${keepAdmin.id})`)
  console.log(`将删除 ${deleteAdmins.length} 个多余管理员账户:`)
  deleteAdmins.forEach((admin, i) => {
    console.log(`  - ID: ${admin.id}, Username: ${admin.username}`)
  })

  // 删除多余的管理员
  for (const admin of deleteAdmins) {
    await db.delete(users).where(eq(users.id, admin.id))
    console.log(`已删除: ${admin.username} (ID: ${admin.id})`)
  }

  // 验证结果
  console.log('\n=== 验证结果 ===')
  const remainingAdmins = await db.select().from(users).where(eq(users.role, 'admin'))
  console.log(`剩余管理员数量: ${remainingAdmins.length}`)
  remainingAdmins.forEach((admin, i) => {
    console.log(`  ${i + 1}. ID: ${admin.id}, Username: ${admin.username}`)
  })

  sqlite.close()
  console.log('\n清理完成!')
}

cleanupExtraAdmins().catch(console.error)
