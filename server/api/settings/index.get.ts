// GET /api/settings - 获取用户设置
import { useUserSettingsService } from '../../services/userSettings'
import { USER_SETTING_KEYS, USER_SETTING_DEFAULTS, type UserSettingKey, type UserSettingValue } from '../../../app/shared/constants'
import { db } from '../../database'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'

// 共享设置：管理员配置，所有用户共享
const SHARED_SETTINGS_KEYS = [
  USER_SETTING_KEYS.DRAWING_AI_OPTIMIZE_AIMODEL_ID,
  USER_SETTING_KEYS.DRAWING_EMBEDDED_AIMODEL_ID,
  USER_SETTING_KEYS.DRAWING_WORKBENCH_AIMODEL_ID,
  USER_SETTING_KEYS.VIDEO_WORKBENCH_AIMODEL_ID,
]

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const settingsService = useUserSettingsService()

  // 获取用户自己的设置
  const userSettings = await settingsService.getAll(user.id)

  // 如果是管理员，直接返回自己的设置
  if (user.role === 'admin') {
    return userSettings
  }

  // 普通用户：合并管理员共享设置 + 用户个人设置
  // 获取管理员用户
  const adminUser = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
  })

  if (adminUser) {
    const adminSettings = await settingsService.getAll(adminUser.id)

    // 用管理员的共享设置覆盖用户的设置
    for (const key of SHARED_SETTINGS_KEYS) {
      const adminValue = adminSettings[key]
      // 如果管理员有配置，使用管理员的值
      if (adminValue !== undefined && adminValue !== USER_SETTING_DEFAULTS[key]) {
        userSettings[key] = adminValue
      }
    }
  }

  return userSettings
})
