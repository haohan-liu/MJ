// 站点配置服务
import { eq } from 'drizzle-orm'
import { siteSettings } from '../database/schema'
import { db } from '../database'
import { SITE_SETTING_KEYS, SITE_SETTING_DEFAULTS, type SiteSettingKey } from '../../app/shared/constants'

export function useSiteSettingsService() {
  // 获取单个配置
  async function get(key: SiteSettingKey): Promise<string> {
    const [setting] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1)
    
    return setting?.value ?? SITE_SETTING_DEFAULTS[key] ?? ''
  }

  // 获取所有配置
  async function getAll(): Promise<Record<SiteSettingKey, string>> {
    const settings = await db.select().from(siteSettings)
    
    const result: Record<string, string> = { ...SITE_SETTING_DEFAULTS }
    for (const setting of settings) {
      result[setting.key] = setting.value
    }
    
    return result as Record<SiteSettingKey, string>
  }

  // 设置单个配置
  async function set(key: SiteSettingKey, value: string): Promise<void> {
    const now = new Date()
    
    // 使用 upsert
    const existing = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1)
    
    if (existing.length > 0) {
      await db
        .update(siteSettings)
        .set({ value, updatedAt: now })
        .where(eq(siteSettings.key, key))
    } else {
      await db.insert(siteSettings).values({
        key,
        value,
        updatedAt: now,
      })
    }
  }

  // 批量设置
  async function setMany(settingsMap: Partial<Record<SiteSettingKey, string>>): Promise<void> {
    for (const [key, value] of Object.entries(settingsMap)) {
      if (value !== undefined) {
        await set(key as SiteSettingKey, value)
      }
    }
  }

  return {
    get,
    getAll,
    set,
    setMany,
  }
}
