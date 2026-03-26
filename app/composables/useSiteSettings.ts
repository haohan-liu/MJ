// 站点设置全局 Composable
import { SITE_SETTING_KEYS, SITE_SETTING_DEFAULTS, type SiteSettingKey } from '~/shared/constants'

export function useSiteSettings() {
  // 全局状态：使用 useState 确保服务端和客户端数据同步，且在函数内部调用
  const siteSettings = useState<Record<string, string>>('site-settings', () => ({}))

  // 计算属性：提供默认值
  const siteName = computed(() => siteSettings.value[SITE_SETTING_KEYS.SITE_NAME] || SITE_SETTING_DEFAULTS[SITE_SETTING_KEYS.SITE_NAME])
  const siteSlogan = computed(() => siteSettings.value[SITE_SETTING_KEYS.SITE_SLOGAN] || SITE_SETTING_DEFAULTS[SITE_SETTING_KEYS.SITE_SLOGAN])
  const siteLogo = computed(() => siteSettings.value[SITE_SETTING_KEYS.SITE_LOGO_URL] || SITE_SETTING_DEFAULTS[SITE_SETTING_KEYS.SITE_LOGO_URL])
  const siteCopyright = computed(() => siteSettings.value[SITE_SETTING_KEYS.SITE_COPYRIGHT] || SITE_SETTING_DEFAULTS[SITE_SETTING_KEYS.SITE_COPYRIGHT])
  const apiPlatformUrl = computed(() => siteSettings.value[SITE_SETTING_KEYS.API_PLATFORM_URL] || SITE_SETTING_DEFAULTS[SITE_SETTING_KEYS.API_PLATFORM_URL])
  const apiPlatformName = computed(() => siteSettings.value[SITE_SETTING_KEYS.API_PLATFORM_NAME] || SITE_SETTING_DEFAULTS[SITE_SETTING_KEYS.API_PLATFORM_NAME])

  // 加载站点设置
  async function loadSettings() {
    try {
      const settings = await $fetch<Record<SiteSettingKey, string>>('/api/site-settings/public')
      siteSettings.value = settings
    } catch (error) {
      console.error('加载站点配置失败:', error)
    }
  }

  return {
    siteSettings: readonly(siteSettings),
    siteName,
    siteSlogan,
    siteLogo,
    siteCopyright,
    apiPlatformUrl,
    apiPlatformName,
    loadSettings,
  }
}
