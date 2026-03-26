// DELETE /api/upstreams/[id] - 删除上游配置（级联删除 aimodels）
import { useUpstreamService } from '../../services/upstream'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '配置ID不能为空' })
  }

  const upstreamId = parseInt(id, 10)
  if (isNaN(upstreamId)) {
    throw createError({ statusCode: 400, message: '无效的配置ID' })
  }

  const service = useUpstreamService()
  const deleted = await service.remove(upstreamId, user.id)

  if (!deleted) {
    throw createError({ statusCode: 404, message: '配置不存在或无权删除' })
  }

  return { success: true }
})
