// API Key 验证服务
// 用于验证用户提供的 API Key 是否有效

import { useSiteSettingsService } from '../services/siteSettings'
import { SITE_SETTING_KEYS } from '../../app/shared/constants'

export interface TokenInfo {
  id: number
  name: string
  key: string
  status: number
  usedQuota: number
  unlimitedQuota: boolean
  remainQuota: number
  expiredTime: number
  createdAt: number
}

export interface ApiKeyValidationResult {
  valid: boolean
  name?: string
  tokenInfo?: TokenInfo
  error?: string
}

/**
 * 验证 API Key
 * 通过调用 New API 的 /api/usage/token/ 接口验证 API Key
 * 该接口使用 TokenAuthReadOnly 中间件，可以直接用 API Key 验证
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  // 从数据库获取 New API 服务地址
  const siteSettingsService = useSiteSettingsService()
  const baseUrl = await siteSettingsService.get(SITE_SETTING_KEYS.NEW_API_BASE_URL)

  // 如果数据库中没有配置，尝试从环境变量获取（向后兼容）
  const finalBaseUrl = baseUrl || process.env.NUXT_NEW_API_BASE_URL

  if (!finalBaseUrl) {
    return {
      valid: false,
      error: 'New API 服务地址未配置，请在站点配置中设置',
    }
  }

  try {
    // 使用 /api/usage/token/ 接口验证 API Key
    // 该接口接受 Bearer token 认证
    const response = await fetch(`${finalBaseUrl}/api/usage/token/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        return {
          valid: false,
          error: 'API Key 无效',
        }
      }
      return {
        valid: false,
        error: `验证失败: HTTP ${response.status}`,
      }
    }

    const data = await response.json()

    // 检查响应格式
    if (data.code || data.data) {
      const tokenData = data.data
      return {
        valid: true,
        name: tokenData?.name || '用户',
        tokenInfo: {
          id: 0,
          name: tokenData?.name || '用户',
          key: apiKey,
          status: 1,
          usedQuota: tokenData?.total_used || 0,
          unlimitedQuota: tokenData?.unlimited_quota || false,
          remainQuota: tokenData?.total_available || 0,
          expiredTime: tokenData?.expires_at || 0,
          createdAt: Date.now(),
        },
      }
    }

    // 处理错误响应
    if (data.success === false) {
      return {
        valid: false,
        error: data.message || 'API Key 验证失败',
      }
    }

    return {
      valid: false,
      error: '响应格式异常',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '网络请求失败'
    return {
      valid: false,
      error: `验证失败: ${errorMessage}`,
    }
  }
}
