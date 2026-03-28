// GET /api/admin/admin-account - 获取管理员账号信息
// PUT /api/admin/admin-account - 修改管理员账号信息
import { db } from '../../database'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  // 仅管理员可访问
  const { user: currentUser } = await requireAdmin(event)

  // GET 请求：获取管理员账号信息
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
    }
  }

  // PUT 请求：修改管理员账号信息
  if (event.method === 'PUT') {
    const body = await readBody(event)
    const { username, password, name, currentPassword } = body

    // 查找当前管理员
    const admin = await db.query.users.findFirst({
      where: eq(users.role, 'admin'),
    })

    if (!admin) {
      throw createError({
        statusCode: 404,
        message: '未找到管理员账号',
      })
    }

    // 验证当前密码（如果修改密码）
    if (password) {
      if (!currentPassword) {
        throw createError({
          statusCode: 400,
          message: '请输入当前密码以确认身份',
        })
      }

      if (!admin.password) {
        throw createError({
          statusCode: 400,
          message: '当前管理员未设置密码',
        })
      }

      const { verifyPassword } = await import('../../utils/password')
      const isValid = await verifyPassword(admin.password, currentPassword)
      if (!isValid) {
        throw createError({
          statusCode: 401,
          message: '当前密码错误',
        })
      }

      // 验证新密码长度
      if (password.length < 6) {
        throw createError({
          statusCode: 400,
          message: '新密码长度不能少于6位',
        })
      }
    }

    // 验证用户名（如果修改）
    if (username && username !== admin.username) {
      // 检查用户名是否已被占用
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

    // 构建更新数据
    const updateData: Record<string, any> = {}

    if (username && username !== admin.username) {
      updateData.username = username
    }

    if (password) {
      updateData.password = await hashPassword(password)
    }

    if (name !== undefined) {
      updateData.name = name
    }

    // 如果没有要更新的内容
    if (Object.keys(updateData).length === 0) {
      throw createError({
        statusCode: 400,
        message: '没有需要更新的内容',
      })
    }

    // 执行更新
    await db.update(users)
      .set(updateData)
      .where(eq(users.id, admin.id))

    // 返回更新后的信息
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
