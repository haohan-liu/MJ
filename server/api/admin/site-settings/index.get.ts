// GET /api/admin/site-settings - 获取站点配置（管理员）
import { useSiteSettingsService } from '../../../services/siteSettings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  
  const service = useSiteSettingsService()
  return service.getAll()
})
