/**
 * OpenAI Chat Completions API Provider（绘图）
 *
 * 同步模式：一次请求返回结果
 * 端点：POST /v1/chat/completions
 *
 * 适用于: GPT-4o Image, Grok-4, Sora Image 等
 */

import type { SyncProvider, SyncResult, GenerateParams } from './types'
import { logTaskRequest, logTaskResponse } from '../../utils/httpLogger'
import { classifyFetchError, extractFetchErrorInfo, ERROR_MESSAGES } from '../errorClassifier'
import type { Aimodel } from '../../database/schema'
import { resolveUpstreamConnection } from '../providerConnection'

interface OpenAIChatResponse {
  id: string
  object: string
  created: number
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// 从 content 中提取图片 URL
function extractImageUrl(content: string): string | undefined {
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
  if (markdownMatch) return markdownMatch[1]

  const dataUrlMatch = content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/)
  if (dataUrlMatch) return dataUrlMatch[1]

  const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp))/i)
  if (urlMatch) return urlMatch[1]

  return undefined
}

export const openaiChatImageProvider: SyncProvider = {
  meta: {
    apiFormat: 'openai-chat',
    label: 'OpenAI Chat',
    category: 'image',
    isAsync: false,
    supportedModelTypes: ['gpt4o-image', 'sora-image', 'grok-image', 'qwen-image', 'gemini'],
    capabilities: {
      referenceImage: true,
      size: true,
      quality: true,
      background: true,
    },
    validation: {
      supportsImageUrl: true,
    },
  },

  async createService(aimodel: Aimodel, userApiKey?: string) {
    const { apiKey, fetchFn, baseUrl } = await resolveUpstreamConnection(aimodel, userApiKey)
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    // 文生图
    async function generateText2Image(params: GenerateParams): Promise<SyncResult> {
      const { taskId, prompt, modelName, modelParams, signal } = params
      const url = `${baseUrl}/v1/chat/completions`
      
      // 构建请求体
      const body: Record<string, unknown> = {
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }
      
      // 添加 Gemini 特有参数（通过 New-API 中转时支持）
      // 参考: https://github.com/Calcium-Ion/new-api
      const extraBody: Record<string, unknown> = {}
      const googleConfig: Record<string, unknown> = {}
      const imageConfig: Record<string, unknown> = {}
      
      if (modelParams?.thinkingMode) {
        const thinkingConfig: Record<string, unknown> = {
          thinking_budget: modelParams.thinkingMode === 'fast' ? 1024 : modelParams.thinkingMode === 'medium' ? 4096 : 8192
        }
        googleConfig['thinking_config'] = thinkingConfig
      }
      if (modelParams?.webSearch) {
        body.web_search = true
      }
      if (modelParams?.aspectRatio) {
        imageConfig['aspect_ratio'] = modelParams.aspectRatio
      }
      // size 放入 image_config.image_size（New-API Gemini 格式，直接传简写值如 "1K"/"2K"/"4K"）
      if (modelParams?.size) {
        imageConfig['image_size'] = modelParams.size
      }
      
      // 组装 extra_body
      if (Object.keys(imageConfig).length > 0) {
        googleConfig['image_config'] = imageConfig
      }
      if (Object.keys(googleConfig).length > 0) {
        extraBody['google'] = googleConfig
      }
      if (Object.keys(extraBody).length > 0) {
        body.extra_body = extraBody
      }

      const startTime = Date.now()
      logTaskRequest(taskId, { url, method: 'POST', headers, body })

      try {
        const res = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
        const response = await res.json() as OpenAIChatResponse
        logTaskResponse(taskId, { status: res.status, statusText: res.statusText, body: response, durationMs: Date.now() - startTime })

        const content = response.choices?.[0]?.message?.content || ''
        const imageUrl = extractImageUrl(content)

        if (!imageUrl) {
          return { success: false, error: ERROR_MESSAGES.PARSE_ERROR }
        }

        if (imageUrl.startsWith('data:image/')) {
          const match = imageUrl.match(/data:(image\/[^;]+);base64,(.+)/)
          if (match) {
            return { success: true, imageBase64: match[2], mimeType: match[1] }
          }
        }

        return { success: true, resourceUrl: imageUrl }
      } catch (error: unknown) {
        const errorInfo = extractFetchErrorInfo(error)
        logTaskResponse(taskId, {
          status: errorInfo.status,
          statusText: errorInfo.statusText,
          body: errorInfo.body,
          error: errorInfo.message,
          errorType: errorInfo.errorType,
          durationMs: Date.now() - startTime,
        })
        return { success: false, error: classifyFetchError(error) }
      }
    }

    // 垫图（带参考图）
    async function generateWithRef(params: GenerateParams): Promise<SyncResult> {
      const { taskId, prompt, images, modelName, modelParams, signal } = params

      if (!images || images.length === 0) {
        return generateText2Image(params)
      }

      const url = `${baseUrl}/v1/chat/completions`

      // 构建 multimodal 消息
      const contentParts: Array<{type: 'text' | 'image_url', text?: string, image_url?: {url: string}}> = []

      for (const img of images) {
        contentParts.push({ type: 'image_url', image_url: { url: img } })
      }
      contentParts.push({ type: 'text', text: prompt })

      // 构建请求体
      const body: Record<string, unknown> = {
        model: modelName,
        messages: [{ role: 'user', content: contentParts }],
        stream: false,
      }
      
      // 添加 Gemini 特有参数（通过 New-API 中转时支持）
      // 参考: https://github.com/Calcium-Ion/new-api
      const extraBody: Record<string, unknown> = {}
      const googleConfig: Record<string, unknown> = {}
      const imageConfig: Record<string, unknown> = {}
      
      if (modelParams?.thinkingMode) {
        const thinkingConfig: Record<string, unknown> = {
          thinking_budget: modelParams.thinkingMode === 'fast' ? 1024 : modelParams.thinkingMode === 'medium' ? 4096 : 8192
        }
        googleConfig['thinking_config'] = thinkingConfig
      }
      if (modelParams?.webSearch) {
        body.web_search = true
      }
      if (modelParams?.aspectRatio) {
        imageConfig['aspect_ratio'] = modelParams.aspectRatio
      }
      // size 放入 image_config.image_size（New-API Gemini 格式，直接传简写值如 "1K"/"2K"/"4K"）
      if (modelParams?.size) {
        imageConfig['image_size'] = modelParams.size
      }
      
      // 组装 extra_body
      if (Object.keys(imageConfig).length > 0) {
        googleConfig['image_config'] = imageConfig
      }
      if (Object.keys(googleConfig).length > 0) {
        extraBody['google'] = googleConfig
      }
      if (Object.keys(extraBody).length > 0) {
        body.extra_body = extraBody
      }

      const startTime = Date.now()

      // 请求中的图片数据截断记录
      const logBody = JSON.parse(JSON.stringify(body))
      logBody.messages?.[0]?.content?.forEach((p: { image_url?: { url?: string } }) => {
        if (p.image_url?.url?.startsWith('data:')) {
          p.image_url.url = `[base64 ${p.image_url.url.length} chars]`
        }
      })
      logTaskRequest(taskId, { url, method: 'POST', headers, body: logBody })

      try {
        const res = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
        const response = await res.json() as OpenAIChatResponse
        logTaskResponse(taskId, { status: res.status, statusText: res.statusText, body: response, durationMs: Date.now() - startTime })

        const content = response.choices?.[0]?.message?.content || ''
        const imageUrl = extractImageUrl(content)

        if (!imageUrl) {
          return { success: false, error: ERROR_MESSAGES.PARSE_ERROR }
        }

        if (imageUrl.startsWith('data:image/')) {
          const match = imageUrl.match(/data:(image\/[^;]+);base64,(.+)/)
          if (match) {
            return { success: true, imageBase64: match[2], mimeType: match[1] }
          }
        }

        return { success: true, resourceUrl: imageUrl }
      } catch (error: unknown) {
        const errorInfo = extractFetchErrorInfo(error)
        logTaskResponse(taskId, {
          status: errorInfo.status,
          statusText: errorInfo.statusText,
          body: errorInfo.body,
          error: errorInfo.message,
          errorType: errorInfo.errorType,
          durationMs: Date.now() - startTime,
        })
        return { success: false, error: classifyFetchError(error) }
      }
    }

    return {
      async generate(params: GenerateParams): Promise<SyncResult> {
        if (params.images && params.images.length > 0) {
          return generateWithRef(params)
        }
        return generateText2Image(params)
      },
    }
  },
}
