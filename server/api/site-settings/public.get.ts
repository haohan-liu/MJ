// GET /api/site-settings/public - 公开获取站点配置（前台使用）
import { useSiteSettingsService } from '../../services/siteSettings'

export default defineEventHandler(async () => {
  const service = useSiteSettingsService()
  return service.getAll()
})
