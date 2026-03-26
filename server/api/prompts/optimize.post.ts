// POST /api/prompts/optimize - AI 优化绘图提示词
import { getChatProvider } from '../../services/chatProviders'
import type { ChatApiFormat } from '../../services/chatProviders'
import { useAimodelService } from '../../services/aimodel'
import { useUserSettingsService } from '../../services/userSettings'
import { useUpstreamService } from '../../services/upstream'
import { getErrorMessage } from '../../../app/shared/types'
import { USER_SETTING_KEYS } from '../../../app/shared/constants'
import { db } from '../../database'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'

function buildModelInfo(targetModelType?: string, targetModelName?: string): string {
  if (!targetModelType && !targetModelName) {
    return ''
  }
  return `
目标绘图模型信息：
- 模型类型: ${targetModelType || '未指定'}
- 模型名称: ${targetModelName || '未指定'}

请根据目标模型的特点优化提示词。例如：
- Midjourney: 支持 --ar, --v, --style 等参数
- DALL-E: 偏好详细的场景描述
- Flux: 擅长真实感图片
- Stable Diffusion: 支持负面提示词`
}

export default defineEventHandler(async (event) => {
  // 需要登录
  const { user } = await requireAuth(event)

  const body = await readBody(event)
  const { prompt, aimodelId, targetModelType, targetModelName } = body

  if (!prompt?.trim()) {
    throw createError({
      statusCode: 400,
      message: '请提供需要优化的提示词',
    })
  }

  if (!aimodelId) {
    throw createError({
      statusCode: 400,
      message: '请先在设置中配置 AI 优化模型',
    })
  }

  const aimodelService = useAimodelService()
  const settingsService = useUserSettingsService()
  const upstreamService = useUpstreamService()

  // 获取 AI 模型配置
  const aimodel = await aimodelService.getById(aimodelId)
  if (!aimodel) {
    throw createError({
      statusCode: 404,
      message: '模型配置不存在',
    })
  }

  // 获取上游配置以验证所有权
  const upstream = await upstreamService.getByIdSimple(aimodel.upstreamId)
  if (!upstream) {
    throw createError({
      statusCode: 404,
      message: '上游配置不存在',
    })
  }

  // 权限验证：管理员可以使用自己的模型，普通用户可以使用管理员的模型
  if (user.role !== 'admin') {
    // 普通用户：检查是否是管理员配置的共享模型
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, 'admin'),
    })
    if (adminUser && upstream.userId !== adminUser.id) {
      throw createError({
        statusCode: 403,
        message: '无权使用该模型',
      })
    }
  } else {
    // 管理员：检查是否是自己的模型
    if (upstream.userId !== user.id) {
      throw createError({
        statusCode: 403,
        message: '无权使用该模型',
      })
    }
  }

  try {
    const modelName = aimodel.modelName
    const apiFormat = aimodel.apiFormat as ChatApiFormat

    // 获取用户的 API Key
    const userRecord = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { apiKey: true },
    })
    const userApiKey = userRecord?.apiKey || undefined

    // 获取 ChatProvider
    const chatProvider = getChatProvider(apiFormat)
    if (!chatProvider) {
      throw createError({
        statusCode: 500,
        message: `不支持的聊天 API 格式: ${apiFormat}`,
      })
    }

    const chatService = await chatProvider.createService(aimodel, userApiKey)
    // 获取用户配置的提示词模板
    const optimizePromptTemplate = await settingsService.get<string>(user.id, USER_SETTING_KEYS.PROMPT_OPTIMIZE)
    // 替换占位符
    const modelInfo = buildModelInfo(targetModelType, targetModelName)
    const systemPrompt = optimizePromptTemplate.replace('{modelInfo}', modelInfo)
    const result = await chatService.chat(
      modelName,
      systemPrompt,
      [],
      prompt.trim()
    )

    if (!result.success) {
      throw createError({
        statusCode: 500,
        message: result.error || '优化失败',
      })
    }

    // 解析 JSON 响应
    const content = result.content?.trim() || ''
    let optimizedPrompt = content
    let negativePrompt = ''

    try {
      // 尝试解析 JSON
      const parsed = JSON.parse(content)
      if (parsed.prompt) {
        optimizedPrompt = parsed.prompt
        negativePrompt = parsed.negativePrompt || ''
      }
    } catch {
      // 如果不是 JSON，直接使用原始内容作为提示词
      optimizedPrompt = content
    }

    return {
      success: true,
      optimizedPrompt,
      negativePrompt,
    }
  } catch (error: unknown) {
    throw createError({
      statusCode: 500,
      message: getErrorMessage(error),
    })
  }
})
