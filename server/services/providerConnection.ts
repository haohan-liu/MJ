import type { Aimodel } from '../database/schema'
import { useUpstreamService } from './upstream'
import { getUpstreamProxyUrl } from './proxy'
import { proxyFetch } from '../utils/proxy'

/**
 * 解析上游连接配置
 * @param aimodel AI 模型配置
 * @param userApiKey 用户自己的 API Key（可选，优先使用）
 */
export async function resolveUpstreamConnection(aimodel: Aimodel, userApiKey?: string) {
  const upstreamService = useUpstreamService()
  const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)
  if (!upstream) {
    throw new Error('上游配置不存在')
  }
  // 优先使用用户自己的 API Key，否则使用上游配置里的 Key
  const apiKey = userApiKey || upstreamService.getApiKey(upstream, aimodel.keyName)
  const proxyUrl = await getUpstreamProxyUrl(upstream)
  const fetchFn = proxyFetch(proxyUrl)
  return { apiKey, fetchFn, baseUrl: upstream.baseUrl, upstreamName: upstream.name }
}
