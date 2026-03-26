/**
 * 模型推断逻辑
 * 从模型 ID 推断分类、能力、API 格式等信息
 */

import type { ModelCategory, ModelCapability, ApiFormat, ModelType } from './types'

// ==================== 推断结果类型 ====================

export interface InferredModelInfo {
  category: ModelCategory
  group: string
  capabilities: ModelCapability[]
  apiFormat: ApiFormat
  modelType: ModelType
}

// ==================== 厂商分组推断 ====================

// 厂商匹配规则（按顺序匹配，更具体的规则放前面）
const VENDOR_RULES: [RegExp, string][] = [
  // OpenAI 系列
  [/\b(gpt|o1|o3|o4|dall-e|sora)\b/i, 'OpenAI'],
  [/gpt-image/i, 'OpenAI'],
  [/openai/i, 'OpenAI'],

  // Anthropic
  [/claude/i, 'Anthropic'],
  [/anthropic/i, 'Anthropic'],

  // Google
  [/gemini/i, 'Google'],
  [/gemma/i, 'Google'],
  [/palm/i, 'Google'],
  [/bison/i, 'Google'],
  [/\bveo\b/i, 'Google'],

  // 阿里
  [/(qwen|qwq|qvq|wan-)/i, '阿里'],

  // 字节跳动
  [/doubao/i, '字节跳动'],
  [/seedream/i, '字节跳动'],
  [/jimeng/i, '字节跳动'],
  [/bytedance/i, '字节跳动'],

  // 深度求索
  [/deepseek/i, 'DeepSeek'],

  // 智谱
  [/glm/i, '智谱'],
  [/cogview/i, '智谱'],
  [/zhipu/i, '智谱'],

  // MiniMax
  [/abab/i, 'MiniMax'],
  [/minimax/i, 'MiniMax'],
  [/hailuo/i, 'MiniMax'],

  // 月之暗面
  [/moonshot/i, '月之暗面'],
  [/kimi/i, '月之暗面'],

  // 腾讯
  [/hunyuan/i, '腾讯'],

  // xAI
  [/grok/i, 'xAI'],

  // Meta
  [/llama/i, 'Meta'],

  // Mistral
  [/mixtral/i, 'Mistral'],
  [/mistral/i, 'Mistral'],
  [/codestral/i, 'Mistral'],
  [/ministral/i, 'Mistral'],
  [/magistral/i, 'Mistral'],
  [/pixtral/i, 'Mistral'],

  // 零一万物
  [/yi-/i, '零一万物'],

  // 百川
  [/baichuan/i, '百川'],

  // 阶跃星辰
  [/step/i, '阶跃星辰'],

  // Microsoft
  [/phi/i, 'Microsoft'],
  [/copilot/i, 'Microsoft'],

  // Stability AI
  [/stable-/i, 'Stability'],
  [/sdxl/i, 'Stability'],
  [/flux/i, 'Black Forest'],

  // Midjourney
  [/midjourney/i, 'Midjourney'],
  [/mj-/i, 'Midjourney'],

  // Cohere
  [/cohere/i, 'Cohere'],
  [/command/i, 'Cohere'],

  // 讯飞
  [/sparkdesk/i, '讯飞'],

  // Perplexity
  [/perplexity/i, 'Perplexity'],
  [/sonar/i, 'Perplexity'],

  // Luma
  [/luma/i, 'Luma'],

  // 快手可灵
  [/keling/i, '快手'],
  [/kling/i, '快手'],

  // 生数科技
  [/vidu-/i, '生数科技'],

  // Suno
  [/suno/i, 'Suno'],
  [/chirp/i, 'Suno'],

  // AI21
  [/ai21/i, 'AI21'],
  [/jamba-/i, 'AI21'],

  // NVIDIA
  [/nvidia/i, 'NVIDIA'],

  // Jina
  [/jina/i, 'Jina'],

  // 360
  [/360/i, '360'],

  // 面壁智能
  [/minicpm/i, '面壁智能'],

  // 书生
  [/internlm/i, '书生'],
  [/internvl/i, '书生'],

  // 文心
  [/ernie-/i, '百度'],
]

/**
 * 从模型 ID 推断厂商分组
 */
export function getModelGroup(modelId: string): string {
  if (!modelId) return '其他'

  for (const [pattern, vendor] of VENDOR_RULES) {
    if (pattern.test(modelId)) {
      return vendor
    }
  }

  return '其他'
}

// ==================== 厂商显示信息 ====================

/**
 * 厂商显示名称映射
 */
export const VENDOR_DISPLAY_NAMES: Record<string, string> = {
  'OpenAI': 'OpenAI',
  'Anthropic': 'Anthropic',
  'Google': '谷歌',
  '阿里': '阿里',
  '字节跳动': '豆包',
  'DeepSeek': 'DeepSeek',
  '智谱': '智谱',
  'MiniMax': 'MiniMax',
  '月之暗面': 'Kimi',
  '腾讯': '腾讯',
  'xAI': 'xAI',
  'Meta': 'Meta',
  'Mistral': 'Mistral',
  '零一万物': '零一万物',
  '百川': '百川',
  '阶跃星辰': '阶跃星辰',
  'Microsoft': 'Microsoft',
  'Stability': 'Stability',
  'Black Forest': 'Black Forest',
  'Midjourney': 'Midjourney',
  'Cohere': 'Cohere',
  '讯飞': '讯飞',
  'Perplexity': 'Perplexity',
  'Luma': 'Luma',
  '快手': '快手',
  '生数科技': '生数科技',
  'Suno': 'Suno',
  'AI21': 'AI21',
  'NVIDIA': 'NVIDIA',
  'Jina': 'Jina',
  '360': '360',
  '面壁智能': '面壁智能',
  '书生': '书生',
  '百度': '百度',
  '其他': '其他',
}

/**
 * 厂商图标映射（heroicons）
 */
export const VENDOR_ICONS: Record<string, string> = {
  'OpenAI': 'i-heroicons-sparkles',
  'Anthropic': 'i-heroicons-cpu-chip',
  'Google': 'i-heroicons-globe-alt',
  '阿里': 'i-heroicons-cloud',
  '字节跳动': 'i-heroicons-fire',
  'DeepSeek': 'i-heroicons-bolt',
  '智谱': 'i-heroicons-academic-cap',
  'MiniMax': 'i-heroicons-chart-bar',
  '月之暗面': 'i-heroicons-moon',
  '腾讯': 'i-heroicons-chat-bubble-oval-left-ellipsis',
  'xAI': 'i-heroicons-rocket-launch',
  'Meta': 'i-heroicons-user-group',
  'Mistral': 'i-heroicons-wind',
  '零一万物': 'i-heroicons-cube',
  '百川': 'i-heroicons-arrow-trending-up',
  '阶跃星辰': 'i-heroicons-arrow-up-tray',
  'Microsoft': 'i-heroicons-window',
  'Stability': 'i-heroicons-photo',
  'Black Forest': 'i-heroicons-beaker',
  'Midjourney': 'i-heroicons-sparkles',
  'Cohere': 'i-heroicons-code-bracket',
  '讯飞': 'i-heroicons-speaker-wave',
  'Perplexity': 'i-heroicons-magnifying-glass',
  'Luma': 'i-heroicons-video-camera',
  '快手': 'i-heroicons-play-circle',
  '生数科技': 'i-heroicons-film',
  'Suno': 'i-heroicons-musical-note',
  'AI21': 'i-heroicons-calculator',
  'NVIDIA': 'i-heroicons-cpu-chip',
  'Jina': 'i-heroicons-magnifying-glass-circle',
  '360': 'i-heroicons-shield-check',
  '面壁智能': 'i-heroicons-building-office',
  '书生': 'i-heroicons-book-open',
  '百度': 'i-heroicons-globe-alt',
  '其他': 'i-heroicons-question-mark-circle',
}

/**
 * 厂商 Logo 图片映射（真实 logo）
 */
export const VENDOR_LOGOS: Record<string, string> = {
  'OpenAI': '/models/gpt_4.png',
  'Anthropic': '/models/claude.png',
  'Google': '/models/google.png',
  '阿里': '/models/qwen.png',
  '字节跳动': '/models/doubao.png',
  'DeepSeek': '/models/deepseek.png',
  '智谱': '/models/zhipu.png',
  'MiniMax': '/models/minimax.png',
  '月之暗面': '/models/moonshot.png',
  '腾讯': '/models/hunyuan.png',
  'xAI': '/models/grok.png',
  'Meta': '/models/llama.png',
  'Mistral': '/models/mixtral.png',
  '零一万物': '/models/yi.png',
  '百川': '/models/baichuan.png',
  '阶跃星辰': '/models/step.png',
  'Microsoft': '/models/microsoft.png',
  'Stability': '/models/stability.png',
  'Black Forest': '/models/flux.png',
  'Midjourney': '/models/midjourney.png',
  'Cohere': '/models/cohere.png',
  '讯飞': '/models/sparkdesk.png',
  'Perplexity': '/models/perplexity.png',
  'Luma': '/models/luma.png',
  '快手': '/models/keling.png',
  '生数科技': '/models/vidu.png',
  'Suno': '/models/suno.png',
  'AI21': '/models/ai21.png',
  'NVIDIA': '/models/nvidia.png',
  'Jina': '/models/jina.png',
  '360': '/models/360.png',
  '面壁智能': '/models/minicpm.webp',
  '书生': '/models/internlm.png',
  '百度': '/models/wenxin.png',
}

/**
 * 获取厂商显示名称
 */
export function getVendorDisplayName(vendor: string): string {
  return VENDOR_DISPLAY_NAMES[vendor] || vendor
}

/**
 * 获取厂商图标
 */
export function getVendorIcon(vendor: string): string {
  return VENDOR_ICONS[vendor] || 'i-heroicons-question-mark-circle'
}

/**
 * 获取厂商 Logo 图片路径
 */
export function getVendorLogo(vendor: string): string | undefined {
  return VENDOR_LOGOS[vendor]
}

// ==================== 分类推断 ====================

const IMAGE_MODEL_PATTERNS = [
  /dall-e/i,
  /gpt-image/i,
  /gemini.*-image/i,
  /banana/i,
  /flux/i,
  /stable-?diffusion/i,
  /midjourney/i,
  /\bmj-/i,
  /cogview/i,
  /imagen/i,
  /z-image/i,
  /seedream/i,
  /kandinsky/i,
]

const VIDEO_MODEL_PATTERNS = [
  /\bkling/i,
  /\bluma/i,
  /\brunway/i,
  /\bsora\b/i,
  /\bpika/i,
  /\bveo\b/i,
  /jimeng/i,
  /wan2/i,
  /pixverse/i,
]

const EMBEDDING_PATTERNS = [
  /embed/i,
  /bge-/i,
  /\be5-/i,
  /gte-/i,
  /text-embedding/i,
]

/**
 * 推断模型分类
 */
export function inferCategory(modelId: string): ModelCategory {
  // 图片模型
  if (IMAGE_MODEL_PATTERNS.some(p => p.test(modelId))) {
    return 'image'
  }

  // 视频模型
  if (VIDEO_MODEL_PATTERNS.some(p => p.test(modelId))) {
    return 'video'
  }

  // Embedding 模型归类为 chat（暂不单独处理）
  // TTS 模型也归类为 chat

  return 'chat'
}

// ==================== 能力推断 ====================

const VISION_PATTERNS = [
  /gpt-4o/i,
  /gpt-4-turbo/i,
  /gpt-4\.1/i,
  /gpt-4\.5/i,
  /gpt-5/i,
  /claude-3/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /claude-haiku-4/i,
  /gemini-1\.5/i,
  /gemini-2/i,
  /gemini-3/i,
  /qwen-vl/i,
  /qwen2-vl/i,
  /qwen2\.5-vl/i,
  /qwen3-vl/i,
  /\bqvq\b/i,
  /glm-4v/i,
  /deepseek-vl/i,
  /grok-vision/i,
  /grok-4/i,
  /llava/i,
  /minicpm/i,
  /pixtral/i,
]

const REASONING_PATTERNS = [
  /\bo1\b/i,
  /\bo3\b/i,
  /\bo4\b/i,
  /gpt-5/i,
  /\bqwq\b/i,
  /\bqvq\b/i,
  /qwen3.*thinking/i,
  /deepseek-r1/i,
  /deepseek-v3/i,
  /claude-3\.7/i,
  /claude-3-7/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /gemini.*thinking/i,
  /glm-z1/i,
  /glm-4\.5/i,
  /glm-4\.6/i,
  /hunyuan-t1/i,
  /hunyuan-a13b/i,
  /doubao.*thinking/i,
  /doubao-seed/i,
  /grok-3-mini/i,
  /grok-4/i,
  /minimax-m1/i,
  /minimax-m2/i,
]

const FUNCTION_CALLING_PATTERNS = [
  /gpt-4o/i,
  /gpt-4\b/i,
  /gpt-4\.5/i,
  /gpt-5/i,
  /\bo1\b/i,
  /\bo3\b/i,
  /\bo4\b/i,
  /claude/i,
  /\bqwen\b/i,
  /qwen3/i,
  /gemini/i,
  /deepseek/i,
  /glm-4/i,
  /grok-3/i,
  /doubao-seed/i,
  /hunyuan/i,
]

// 排除工具调用的模式
const FUNCTION_CALLING_EXCLUDED = [
  ...EMBEDDING_PATTERNS,
  ...IMAGE_MODEL_PATTERNS,
  /rerank/i,
]

// Web Search 能力匹配规则
const WEB_SEARCH_PATTERNS = [
  // Claude 支持的模型
  /claude-3[.-]5-sonnet/i,
  /claude-3[.-]7-sonnet/i,
  /claude-3[.-]5-haiku/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /claude-haiku-4/i,
  // OpenAI 支持的模型
  /gpt-4o(?!-image)/i,  // gpt-4o 系列（排除 image 变体）
  /gpt-4\.1(?!-nano)/i,
  /\bo3\b/i,
  /\bo4\b/i,
  /gpt-5(?!.*chat)/i,   // gpt-5 系列（排除 chat 变体）
  // Gemini 支持的模型
  /gemini-2(?!.*-image)/i,
  /gemini-3/i,
  // Grok
  /grok-[34]/i,
  // Perplexity
  /sonar/i,
  // 阿里云
  /qwen-turbo/i,
  /qwen-max/i,
  /qwen-plus/i,
  /qwq/i,
  /qwen-flash/i,
  /qwen3-max/i,
  // 智谱
  /glm-4-/i,
  // 腾讯混元（排除 lite）
  /hunyuan(?!-lite)/i,
]

/**
 * 推断模型能力
 */
export function inferCapabilities(modelId: string): ModelCapability[] {
  const capabilities: ModelCapability[] = []

  // 排除非对话模型
  if (EMBEDDING_PATTERNS.some(p => p.test(modelId))) {
    return []
  }

  // 视觉能力
  if (VISION_PATTERNS.some(p => p.test(modelId))) {
    capabilities.push('vision')
  }

  // 推理能力
  if (REASONING_PATTERNS.some(p => p.test(modelId))) {
    capabilities.push('reasoning')
  }

  // 工具调用能力
  const isExcluded = FUNCTION_CALLING_EXCLUDED.some(p => p.test(modelId))
  if (!isExcluded && FUNCTION_CALLING_PATTERNS.some(p => p.test(modelId))) {
    capabilities.push('function_calling')
  }

  // Web Search 能力
  if (WEB_SEARCH_PATTERNS.some(p => p.test(modelId))) {
    capabilities.push('web_search')
  }

  return capabilities
}

// ==================== API 格式推断 ====================

/**
 * 推断 API 格式
 */
export function inferApiFormat(modelId: string): ApiFormat {
  const id = modelId.toLowerCase()

  if (/midjourney|mj-/.test(id)) return 'mj-proxy'
  if (/dall-e|gpt-image/.test(id)) return 'dalle'
  if (/gemini/.test(id)) return 'gemini'
  if (/claude/.test(id)) return 'claude'
  if (/kling|luma|runway|pika|veo|jimeng/.test(id)) return 'video-unified'
  if (/sora/.test(id)) return 'openai-video'

  // OpenAI 模型按版本选择 API 格式
  // gpt-3 系列用 Chat Completion，其他 OpenAI 模型用 Response API
  if (/gpt-3/.test(id)) return 'openai-chat'
  if (/gpt-4|gpt-5|o1|o3|o4/.test(id)) return 'openai-response'

  return 'openai-chat'
}

// ==================== 模型类型推断 ====================

/**
 * 推断模型类型
 */
export function inferModelType(modelId: string, category: ModelCategory): ModelType {
  const id = modelId.toLowerCase()

  if (category === 'image') {
    if (/midjourney|mj-/.test(id)) return 'midjourney'
    if (/dall-e/.test(id)) return 'dalle'
    if (/gpt-image/.test(id)) return 'gpt-image'
    if (/flux/.test(id)) return 'flux'
    if (/gemini/.test(id)) return 'gemini'
    if (/doubao/.test(id)) return 'doubao'
    if (/grok/.test(id)) return 'grok-image'
    if (/qwen/.test(id)) return 'qwen-image'
    if (/sora/.test(id)) return 'sora-image'
    if (/z-image/.test(id)) return 'z-image'
    return 'dalle' // 默认
  }

  if (category === 'video') {
    if (/jimeng/.test(id)) return 'jimeng-video'
    if (/veo/.test(id)) return 'veo'
    if (/sora/.test(id)) return 'sora'
    if (/grok/.test(id)) return 'grok-video'
    return 'jimeng-video' // 默认
  }

  // chat
  if (/gpt|openai|o1|o3|o4/.test(id)) return 'gpt'
  if (/claude/.test(id)) return 'claude'
  if (/gemini/.test(id)) return 'gemini-chat'
  if (/deepseek/.test(id)) return 'deepseek'
  if (/qwen|qwq|qvq/.test(id)) return 'qwen-chat'
  if (/grok/.test(id)) return 'grok'
  if (/llama/.test(id)) return 'llama'
  if (/moonshot|kimi/.test(id)) return 'moonshot'
  if (/glm/.test(id)) return 'glm'
  if (/doubao/.test(id)) return 'doubao-chat'
  if (/minimax/.test(id)) return 'minimax'
  if (/hunyuan/.test(id)) return 'hunyuan'
  if (/mixtral|mistral/.test(id)) return 'mixtral'
  if (/phi/.test(id)) return 'phi'

  return 'gpt' // 默认
}

// ==================== 主函数 ====================

/**
 * 从模型 ID 推断完整的模型信息
 */
export function inferModelInfo(modelId: string): InferredModelInfo {
  const category = inferCategory(modelId)
  const group = getModelGroup(modelId)
  const capabilities = inferCapabilities(modelId)
  const apiFormat = inferApiFormat(modelId)
  const modelType = inferModelType(modelId, category)

  return {
    category,
    group,
    capabilities,
    apiFormat,
    modelType,
  }
}
