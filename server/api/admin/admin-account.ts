// GET /api/admin/admin-account - 获取管理员账号信息
// PUT /api/admin/admin-account - 修改唯一管理员（role=admin）的账号信息，不创建新用户
import { db } from '../../database'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  if (event.method === 'GET') {
    const admin = await db.query.users.findFirst({
      where: eq(users.role, 'admin'),
    })

    if (!admin) {
      throw createError({
        statusCode: 404,
        message: '未找到管理员账号',
      })
    }

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      name: admin.name,
      /** 是否已设置过登录密码（不含哈希，仅布尔） */
      passwordSet: Boolean(admin.password),
    }
  }

  if (event.method === 'PUT') {
    const body = await readBody(event)
    const { username, name, password, currentPassword } = body as {
      username?: string
      name?: string
      password?: string
      currentPassword?: string
    }

    const admin = await db.query.users.findFirst({
      where: eq(users.role, 'admin'),
    })

    if (!admin) {
      throw createError({
        statusCode: 404,
        message: '未找到管理员账号',
      })
    }

    // 仅更新这一条管理员记录（admin.id），绝不 insert 新用户

    if (username && username !== admin.username) {
      const existingUser = await db.query.users.findFirst({
        where: eq(users.username, username),
      })

      if (existingUser && existingUser.id !== admin.id) {
        throw createError({
          statusCode: 400,
          message: '用户名已被占用',
        })
      }

      if (username.length < 2) {
        throw createError({
          statusCode: 400,
          message: '用户名长度不能少于2位',
        })
      }
    }

    const updateData: Record<string, unknown> = {}

    if (username && username !== admin.username) {
      updateData.username = username
    }

    if (name !== undefined) {
      updateData.name = name
    }

    if (password !== undefined && password !== null && String(password).length > 0) {
      const newPwd = String(password)
      if (newPwd.length < 6) {
        throw createError({
          statusCode: 400,
          message: '新密码长度不能少于6位',
        })
      }

      if (admin.password) {
        if (!currentPassword) {
          throw createError({
            statusCode: 400,
            message: '请输入当前密码以确认身份',
          })
        }
        const ok = await verifyPassword(admin.password, currentPassword)
        if (!ok) {
          throw createError({
            statusCode: 401,
            message: '当前密码错误',
          })
        }
      }
      // 管理员尚无密码时允许直接设置首密码（如迁移后 seed 未写 password）
      updateData.password = await hashPassword(newPwd)
    }

    if (Object.keys(updateData).length === 0) {
      throw createError({
        statusCode: 400,
        message: '没有需要更新的内容',
      })
    }

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, admin.id))

    const updatedAdmin = await db.query.users.findFirst({
      where: eq(users.id, admin.id),
    })

    return {
      id: updatedAdmin!.id,
      username: updatedAdmin!.username,
      email: updatedAdmin!.email,
      name: updatedAdmin!.name,
    }
  }

  throw createError({
    statusCode: 405,
    message: '不支持的请求方法',
  })
})
