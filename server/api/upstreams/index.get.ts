// GET /api/upstreams - 获取当前用户的上游配置列表（包含 aimodels）
import { useUpstreamService } from '../../services/upstream'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const service = useUpstreamService()

  return service.listByUser(user.id)
})
