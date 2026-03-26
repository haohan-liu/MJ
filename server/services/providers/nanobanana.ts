/**
 * NanoBanana API Provider
 *
 * 基于 Google Gemini 原生 API 格式的图像生成
 * 严格遵循 Google 官方文档对各模型的能力限制：
 * - gemini-2.5-flash-image: 仅支持基础 1K 分辨率，无搜索/思考功能
 * - gemini-3-pro-image-preview: 支持 1K/2K/4K，仅支持联网搜索
 * - gemini-3.1-flash-image-preview: 全功能支持，包含极端宽高比
 */

import type { SyncProvider, SyncResult, GenerateParams } from './types'
import { logTaskRequest, logTaskResponse } from '../../utils/httpLogger'
import { classifyFetchError, extractFetchErrorInfo, ERROR_MESSAGES } from '../errorClassifier'
import type { Aimodel } from '../../database/schema'
import { resolveUpstreamConnection } from '../providerConnection'

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        inlineData?: {
          mimeType: string
          data: string
        }
      }>
    }
    finishReason?: string
  }>
  error?: {
    code?: number
    message?: string
    status?: string
  }
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
    finish_reason?: string
  }>
  error?: {
    message?: string
    code?: string
  }
}

/** NanoBanana 模型能力定义（严格对应 Google 官方文档） */
interface NanoBananaModelCapabilities {
  modelType: 'nanobanana' | 'nanobanana-pro' | 'nanobanana-2'
  displayName: string
  /** Gemini 原生 API 模型名称 */
  geminiModelName: string
  /** OpenAI 兼容格式的模型名称 */
  openaiModelName: string
  /** 是否支持联网搜索 (Google Search) */
  supportsWebSearch: boolean
  /** 是否支持图片搜索 (Image Search) */
  supportsImageSearch: boolean
  /** 是否支持思考模式 (Thinking) */
  supportsThinking: boolean
  /** 支持的分辨率列表 */
  supportedResolutions: string[]
  /** 支持的宽高比列表 */
  supportedAspectRatios: string[]
}

/**
 * NanoBanana 模型能力配置表
 * 严格遵循 Google 官方文档限制，不携带任何不支持的参数
 */
const NANOBANANA_MODELS: Record<string, NanoBananaModelCapabilities> = {
  // NanoBanana: gemini-2.5-flash-image
  // 官方限制：仅 1K 基础分辨率，无搜索/思考功能
  'nanobanana': {
    modelType: 'nanobanana',
    displayName: 'NanoBanana',
    geminiModelName: 'gemini-2.5-flash-image',
    openaiModelName: 'gemini-2.5-flash-image',
    supportsWebSearch: false,   // 官方明确不支持
    supportsImageSearch: false, // 官方明确不支持
    supportsThinking: false,    // 官方明确不支持
    supportedResolutions: ['1K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  },
  // NanoBanana Pro: gemini-3-pro-image-preview
  // 官方限制：支持 1K/2K/4K，仅支持联网搜索
  'nanobanana-pro': {
    modelType: 'nanobanana-pro',
    displayName: 'NanoBanana Pro',
    geminiModelName: 'gemini-3-pro-image-preview',
    openaiModelName: 'gemini-3-pro-image-preview',
    supportsWebSearch: true,    // 支持联网搜索
    supportsImageSearch: false, // 不支持图片搜索
    supportsThinking: false,    // 不支持思考模式
    supportedResolutions: ['1K', '2K', '4K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  },
  // NanoBanana 2: gemini-3.1-flash-image-preview
  // 官方限制：全功能支持，包含极端宽高比 (1:4, 4:1, 1:8, 8:1)
  'nanobanana-2': {
    modelType: 'nanobanana-2',
    displayName: 'NanoBanana 2',
    geminiModelName: 'gemini-3.1-flash-image-preview',
    openaiModelName: 'gemini-3.1-flash-image-preview',
    supportsWebSearch: true,    // 支持联网搜索
    supportsImageSearch: true,  // 支持图片搜索
    supportsThinking: true,     // 支持思考模式
    supportedResolutions: ['512', '1K', '2K', '4K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:4', '4:1', '1:8', '8:1'],
  },
}

/** 从 modelType 获取模型能力 */
function getNanoBananaModelCapabilities(modelType: string): NanoBananaModelCapabilities | undefined {
  return NANOBANANA_MODELS[modelType]
}

/** 判断是否为 NanoBanana 模型类型 */
function isNanoBananaModelType(modelType: string): boolean {
  return modelType in NANOBANANA_MODELS
}

/** 解析 API 格式 */
type NanoBananaApiFormat = 'nanobanana' | 'nanobanana-openai'

/** 获取 NanoBanana API 格式（支持 Gemini 原生和 OpenAI 兼容） */
function getNanoBananaApiFormat(apiFormat: string): NanoBananaApiFormat {
  if (apiFormat === 'nanobanana-openai') return 'nanobanana-openai'
  return 'nanobanana'
}

// ============================================================================
// 分辨率和宽高比映射
// ============================================================================

/**
 * 分辨率到像素尺寸的映射（用于 Gemini API）
 */
const RESOLUTION_PIXEL_MAP: Record<string, string> = {
  '512': '512x512',
  '1K': '1024x1024',
  '2K': '2048x2048',
  '4K': '4096x4096',
}

/**
 * 宽高比映射表（确保只使用支持的宽高比）
 */
const ASPECT_RATIO_MAP: Record<string, string> = {
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3': '4:3',
  '3:4': '3:4',
  '3:2': '3:2',
  '2:3': '2:3',
  '1:4': '1:4',
  '4:1': '4:1',
  '1:8': '1:8',
  '8:1': '8:1',
}

/**
 * 获取有效的分辨率（严格校验模型支持）
 */
function getValidResolution(resolution: string | undefined, modelCapabilities: NanoBananaModelCapabilities): string {
  if (!resolution) {
    return modelCapabilities.supportedResolutions[0] || '1K'
  }
  // 严格校验分辨率是否在模型支持列表中
  if (modelCapabilities.supportedResolutions.includes(resolution)) {
    return resolution
  }
  // 返回模型支持的第一个分辨率
  return modelCapabilities.supportedResolutions[0] || '1K'
}

/**
 * 获取有效的宽高比（严格校验模型支持）
 */
function getValidAspectRatio(aspectRatio: string | undefined, modelCapabilities: NanoBananaModelCapabilities): string | undefined {
  if (!aspectRatio || aspectRatio === 'auto') {
    return '1:1' // NanoBanana 默认 1:1
  }
  // 严格校验宽高比是否在模型支持列表中
  if (ASPECT_RATIO_MAP[aspectRatio] && modelCapabilities.supportedAspectRatios.includes(aspectRatio)) {
    return aspectRatio
  }
  return undefined
}

/** 提取 base64 数据 */
function extractBase64(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
  if (match) {
    return { mimeType: match[1], data: match[2] }
  }
  return { mimeType: 'image/png', data: dataUrl }
}

// ============================================================================
// Gemini 原生格式 Provider
// ============================================================================

/**
 * 构建 Gemini 原生格式的请求体
 * 严格按模型能力组装 JSON，绝不携带不支持的参数
 */
function buildGeminiNativeRequest(params: {
  prompt: string
  modelName: string
  resolution?: string
  aspectRatio?: string
  base64Image?: string
  mimeType?: string
  enableWebSearch?: boolean
  enableImageSearch?: boolean
  thinkingMode?: 'fast' | 'medium' | 'deep'
  modelCapabilities: NanoBananaModelCapabilities
}): Record<string, unknown> {
  const {
    prompt,
    resolution,
    aspectRatio,
    base64Image,
    mimeType,
    enableWebSearch,
    enableImageSearch,
    thinkingMode,
    modelCapabilities
  } = params

  // 构建 contents parts
  const parts: Record<string, unknown>[] = [{ text: prompt }]

  // 如果有参考图，添加图片
  if (base64Image) {
    parts.push({
      inline_data: {
        mime_type: mimeType || 'image/png',
        data: base64Image,
      },
    })
  }

  // 构建 generationConfig（严格按模型支持）
  const generationConfig: Record<string, unknown> = {
    responseModalities: ['TEXT', 'IMAGE'],
  }

  // 获取有效的分辨率和宽高比
  const validResolution = getValidResolution(resolution, modelCapabilities)
  const validAspectRatio = getValidAspectRatio(aspectRatio, modelCapabilities)

  // 构建 imageConfig
  const imageConfig: Record<string, string> = {
    imageSize: validResolution,
  }
  if (validAspectRatio) {
    imageConfig.aspectRatio = validAspectRatio
  }
  generationConfig.imageConfig = imageConfig

  // 思考模式（仅 NanoBanana 2 支持）
  if (modelCapabilities.supportsThinking && thinkingMode) {
    generationConfig.thinkingMode = thinkingMode
  }

  // 构建请求体
  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig,
  }

  // 严格按模型能力添加工具（tools）
  // 绝对不为 NanoBanana (2.5) 添加任何 tools 字段
  if (modelCapabilities.supportsWebSearch || modelCapabilities.supportsImageSearch) {
    const tools: Record<string, unknown>[] = []

    const canUseWebSearch = modelCapabilities.supportsWebSearch && enableWebSearch
    const canUseImageSearch = modelCapabilities.supportsImageSearch && enableImageSearch

    if (canUseWebSearch && canUseImageSearch) {
      // 同时启用网页搜索和图片搜索
      tools.push({
        google_search: {
          searchTypes: {
            webSearch: {},
            imageSearch: {},
          },
        },
      })
    } else if (canUseImageSearch) {
      // 仅启用图片搜索
      tools.push({
        google_search: {
          searchTypes: {
            imageSearch: {},
          },
        },
      })
    } else if (canUseWebSearch) {
      // 仅启用网页搜索
      tools.push({
        google_search: {},
      })
    }

    if (tools.length > 0) {
      body.tools = tools
    }
  }

  // 绝对不为不支持搜索的模型添加 tools
  // （即使前端错误地发送了 enableWebSearch=true，也会被忽略）

  return body
}

// ============================================================================
// OpenAI 兼容格式 Provider
// ============================================================================

/**
 * 构建 OpenAI 兼容格式的请求体
 * 严格按模型能力组装 JSON，绝不携带不支持的参数
 */
function buildOpenAICompatibleRequest(params: {
  prompt: string
  modelName: string
  resolution?: string
  aspectRatio?: string
  base64Image?: string
  enableWebSearch?: boolean
  enableImageSearch?: boolean
  thinkingMode?: 'fast' | 'medium' | 'deep'
  modelCapabilities: NanoBananaModelCapabilities
}): Record<string, unknown> {
  const {
    prompt,
    resolution,
    aspectRatio,
    base64Image,
    enableWebSearch,
    enableImageSearch,
    thinkingMode,
    modelCapabilities
  } = params

  // 构建消息内容
  const contentParts: Record<string, unknown>[] = []

  // 如果有参考图，添加图片
  if (base64Image) {
    const match = base64Image.match(/^data:(image\/\w+);base64,/)
    const mimeType = match ? match[1] : 'image/png'
    const base64Data = base64Image.replace(/^data:[^;]+;base64,/, '')

    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64Data}`,
      },
    })
  }

  // 添加文本提示
  contentParts.push({
    type: 'text',
    text: prompt,
  })

  // 构建请求体（OpenAI chat completions 格式）
  const body: Record<string, unknown> = {
    model: modelCapabilities.openaiModelName,
    messages: [
      {
        role: 'user',
        content: contentParts,
      },
    ],
    max_tokens: 8192,
    stream: false,
  }

  // 添加图像配置（严格按模型能力）
  const validResolution = getValidResolution(resolution, modelCapabilities)
  const validAspectRatio = getValidAspectRatio(aspectRatio, modelCapabilities)

  // 设置尺寸（转换为像素格式）
  if (RESOLUTION_PIXEL_MAP[validResolution]) {
    body.size = RESOLUTION_PIXEL_MAP[validResolution]
  }

  // 添加宽高比（如果支持）
  if (validAspectRatio) {
    body.aspect_ratio = validAspectRatio
  }

  // 添加工具配置（严格按模型能力）
  // 绝对不为 NanoBanana (2.5) 添加任何 tools
  if (modelCapabilities.supportsWebSearch || modelCapabilities.supportsImageSearch) {
    const tools: Record<string, unknown>[] = []

    const canUseWebSearch = modelCapabilities.supportsWebSearch && enableWebSearch
    const canUseImageSearch = modelCapabilities.supportsImageSearch && enableImageSearch

    if (canUseWebSearch || canUseImageSearch) {
      tools.push({
        type: 'function',
        function: {
          name: 'google_search',
          description: 'Google Search for web and image grounding',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      })

      if (tools.length > 0) {
        body.tools = tools
      }
    }
  }

  // 思考模式（仅 NanoBanana 2 支持）
  if (modelCapabilities.supportsThinking && thinkingMode) {
    body.thinking_mode = thinkingMode
  }

  return body
}

// ============================================================================
// Provider 主逻辑
// ============================================================================

export const nanoBananaProvider: SyncProvider = {
  meta: {
    apiFormat: 'nanobanana',
    label: 'NanoBanana API',
    category: 'image',
    isAsync: false,
    supportedModelTypes: ['nanobanana', 'nanobanana-pro', 'nanobanana-2'],
    capabilities: {
      referenceImage: true,
      negativePrompt: false,
      size: true,
      quality: false,
      style: false,
      aspectRatio: true,
      seed: false,
      guidance: false,
      watermark: false,
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

    // 获取模型能力
    const modelType = aimodel.modelType || ''
    const modelCapabilities = getNanoBananaModelCapabilities(modelType)
    if (!modelCapabilities) {
      throw new Error(`Unknown NanoBanana model type: ${modelType}`)
    }

    // 获取 API 格式
    const apiFormat = getNanoBananaApiFormat(aimodel.apiFormat || 'nanobanana')
    const useOpenAIFormat = apiFormat === 'nanobanana-openai'

    // 确定要使用的模型名称
    function getEffectiveModelName(configuredModelName?: string): string {
      if (configuredModelName) {
        const configuredLower = configuredModelName.toLowerCase()
        for (const key of Object.keys(NANOBANANA_MODELS)) {
          const caps = NANOBANANA_MODELS[key]
          if (configuredLower.includes(caps.geminiModelName.toLowerCase()) ||
              configuredLower.includes(caps.openaiModelName.toLowerCase()) ||
              configuredLower.includes(key)) {
            return useOpenAIFormat ? caps.openaiModelName : caps.geminiModelName
          }
        }
        return configuredModelName
      }
      return useOpenAIFormat ? modelCapabilities.openaiModelName : modelCapabilities.geminiModelName
    }

    // 提取图片数据
    function extractImageData(imageDataUrl: string): { mimeType: string; data: string } | undefined {
      if (!imageDataUrl) return undefined
      return extractBase64(imageDataUrl)
    }

    // ============================================================
    // Gemini 原生格式 - 文生图
    // ============================================================
    async function generateGeminiNative(params: GenerateParams): Promise<SyncResult> {
      const { taskId, prompt, modelName, modelParams, signal, images } = params

      const effectiveModelName = getEffectiveModelName(modelName)
      const url = `${baseUrl}/v1beta/models/${effectiveModelName}:generateContent`

      // 提取参考图
      const imageData = images && images.length > 0 ? extractImageData(images[0]) : undefined

      // 构建请求体（严格按模型能力组装）
      const body = buildGeminiNativeRequest({
        prompt,
        modelName: effectiveModelName,
        resolution: modelParams?.size,
        aspectRatio: modelParams?.aspectRatio,
        base64Image: imageData?.data,
        mimeType: imageData?.mimeType,
        enableWebSearch: modelParams?.webSearch,
        enableImageSearch: modelParams?.imageSearch,
        thinkingMode: modelParams?.thinkingMode,
        modelCapabilities,
      })

      const startTime = Date.now()
      logTaskRequest(taskId, { url, method: 'POST', headers, body })

      try {
        const res = await fetchFn(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        })
        const response = await res.json() as GeminiGenerateContentResponse

        logTaskResponse(taskId, {
          status: res.status,
          statusText: res.statusText,
          body: response,
          durationMs: Date.now() - startTime,
        })

        if (response.error) {
          return { success: false, error: response.error.message || 'API Error' }
        }

        const candidates = response.candidates
        if (!candidates || candidates.length === 0) {
          return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
        }

        const responseParts = candidates[0]?.content?.parts
        if (!responseParts || responseParts.length === 0) {
          return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
        }

        for (const part of responseParts) {
          if (part.inlineData?.data) {
            return {
              success: true,
              imageBase64: part.inlineData.data,
            }
          }
        }

        return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
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

    // ============================================================
    // OpenAI 兼容格式 - 文生图
    // ============================================================
    async function generateOpenAICompatible(params: GenerateParams): Promise<SyncResult> {
      const { taskId, prompt, modelName, modelParams, signal, images } = params

      const effectiveModelName = getEffectiveModelName(modelName)
      const url = `${baseUrl}/v1/chat/completions`

      // 提取参考图
      const imageData = images && images.length > 0 ? images[0] : undefined

      // 构建请求体（严格按模型能力组装）
      const body = buildOpenAICompatibleRequest({
        prompt,
        modelName: effectiveModelName,
        resolution: modelParams?.size,
        aspectRatio: modelParams?.aspectRatio,
        base64Image: imageData,
        enableWebSearch: modelParams?.webSearch,
        enableImageSearch: modelParams?.imageSearch,
        thinkingMode: modelParams?.thinkingMode,
        modelCapabilities,
      })

      const startTime = Date.now()
      logTaskRequest(taskId, { url, method: 'POST', headers, body })

      try {
        const res = await fetchFn(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        })
        const response = await res.json() as OpenAIChatResponse

        logTaskResponse(taskId, {
          status: res.status,
          statusText: res.statusText,
          body: response,
          durationMs: Date.now() - startTime,
        })

        if (response.error) {
          return { success: false, error: response.error.message || 'API Error' }
        }

        const choice = response.choices?.[0]
        if (!choice?.message?.content) {
          return { success: false, error: ERROR_MESSAGES.EMPTY_RESPONSE }
        }

        // OpenAI 格式返回的是 base64 图片或 URL
        const content = choice.message.content

        // 检查是否包含 base64 图片
        const base64Match = content.match(/data:image\/\w+;base64,(.+)/)
        if (base64Match) {
          return {
            success: true,
            imageBase64: base64Match[1],
          }
        }

        // 检查是否包含 URL
        const urlMatch = content.match(/https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp)/i)
        if (urlMatch) {
          return {
            success: true,
            resourceUrl: urlMatch[0],
          }
        }

        // 如果是纯文本响应，说明生成失败
        return { success: false, error: content || ERROR_MESSAGES.EMPTY_RESPONSE }
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

    // ============================================================
    // 统一入口
    // ============================================================
    return {
      async generate(params: GenerateParams): Promise<SyncResult> {
        if (useOpenAIFormat) {
          return generateOpenAICompatible(params)
        }
        return generateGeminiNative(params)
      },
    }
  },
}
