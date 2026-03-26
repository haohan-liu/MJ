// POST /api/auth/login - 管理员账号密码登录
import { useUserService } from '../../services/user'
import { signJwt } from '../../utils/jwt'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, password } = body

  // 验证输入
  if (!username || !password) {
    throw createError({
      statusCode: 400,
      message: '请输入账号和密码',
    })
  }

  const userService = useUserService()

  // 查找用户（支持 username 或 email）
  let user = await userService.findByUsername(username)
  if (!user) {
    // 尝试用邮箱查找（兼容旧数据）
    user = await userService.findByEmail(username)
  }

  if (!user) {
    throw createError({
      statusCode: 401,
      message: '账号或密码错误',
    })
  }

  // 验证是否为管理员
  if (user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: '此接口仅限管理员使用，请使用 API Key 登录',
    })
  }

  // 验证密码
  if (!user.password) {
    throw createError({
      statusCode: 401,
      message: '账号或密码错误',
    })
  }

  const isValid = await verifyPassword(user.password, password)
  if (!isValid) {
    throw createError({
      statusCode: 401,
      message: '账号或密码错误',
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
      role: user.role,
    },
  }
})

