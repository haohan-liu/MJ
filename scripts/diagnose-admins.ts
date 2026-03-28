// 诊断并清理多余管理员账户的脚本
// 运行: npx tsx scripts/diagnose-admins.ts

import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { users } from '../server/database/schema'

const dbPath = './data/mj-studio.db'
const sqlite = new Database(dbPath)
const db = drizzle(sqlite, { schema: { users } })

async function diagnoseAndFix() {
  console.log('=== 诊断管理员账户 ===\n')

  // 1. 查看所有用户
  const allUsers = await db.select().from(users)
  console.log('所有用户:')
  allUsers.forEach((u, i) => {
    console.log(`  ${i + 1}. ID=${u.id}, Username=${u.username}, Role=${u.role}, Email=${u.email}`)
  })

  // 2. 查看所有管理员
  const allAdmins = await db.select().from(users).where(eq(users.role, 'admin'))
  console.log(`\n管理员数量: ${allAdmins.length}`)
  allAdmins.forEach((admin, i) => {
    console.log(`  ${i + 1}. ID=${admin.id}, Username=${admin.username}`)
  })

  if (allAdmins.length === 1) {
    console.log('\n只有1个管理员，尝试重置用户名...')

    const admin = allAdmins[0]

    // 如果当前用户名不是 admin，先检查是否有其他用户叫 admin
    if (admin.username !== 'admin') {
      const existingAdminUsername = await db.query.users.findFirst({
        where: eq(users.username, 'admin'),
      })

      if (existingAdminUsername && existingAdminUsername.id !== admin.id) {
        console.log(`\n用户名 'admin' 已被其他用户 (ID=${existingAdminUsername.id}) 占用`)
        console.log('删除占用的用户...')

        // 删除占用的用户
        await db.delete(users).where(eq(users.id, existingAdminUsername.id))
        console.log('已删除占用的用户')
      }
    }

    // 更新管理员账户
    await db.update(users)
      .set({
        username: 'admin',
      })
      .where(eq(users.id, admin.id))

    console.log('\n管理员账户已重置为:')
    console.log('  账号: admin')
  } else if (allAdmins.length > 1) {
    console.log(`\n发现 ${allAdmins.length} 个管理员，将只保留第一个...`)

    // 保留最早创建的
    const sortedAdmins = [...allAdmins].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return aTime - bTime
    })

    const keepAdmin = sortedAdmins[0]
    const deleteAdmins = sortedAdmins.slice(1)

    console.log(`\n保留: ID=${keepAdmin.id}, Username=${keepAdmin.username}`)
    deleteAdmins.forEach(a => {
      console.log(`删除: ID=${a.id}, Username=${a.username}`)
    })

    // 删除多余管理员
    for (const admin of deleteAdmins) {
      await db.delete(users).where(eq(users.id, admin.id))
    }

    // 重置保留的管理员为默认账号
    await db.update(users)
      .set({
        username: 'admin',
      })
      .where(eq(users.id, keepAdmin.id))

    console.log('\n管理员账户已重置为:')
    console.log('  账号: admin')
  }

  // 验证最终结果
  console.log('\n=== 最终状态 ===')
  const finalAdmins = await db.select().from(users).where(eq(users.role, 'admin'))
  console.log(`管理员数量: ${finalAdmins.length}`)
  finalAdmins.forEach((admin, i) => {
    console.log(`  ${i + 1}. ID=${admin.id}, Username=${admin.username}`)
  })

  sqlite.close()
  console.log('\n完成!')
}

diagnoseAndFix().catch(console.error)
