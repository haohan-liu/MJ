// PUT /api/admin/site-settings - 更新站点配置（管理员）
import { useSiteSettingsService } from '../../../services/siteSettings'
import { SITE_SETTING_KEYS, type SiteSettingKey } from '../../../../app/shared/constants'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  
  const body = await readBody(event)
  const service = useSiteSettingsService()
  
  // 验证键名
  const validKeys = Object.values(SITE_SETTING_KEYS)
  const updates: Partial<Record<SiteSettingKey, string>> = {}
  
  for (const [key, value] of Object.entries(body)) {
    if (validKeys.includes(key as SiteSettingKey) && typeof value === 'string') {
      updates[key as SiteSettingKey] = value
    }
  }
  
  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: '没有有效的配置项' })
  }
  
  await service.setMany(updates)
  
  return service.getAll()
})
