import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const dbPath = './data/mj-studio.db'

// 确保数据目录存在
const dir = dirname(dbPath)
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true })
}

const sqlite: DatabaseType = new Database(dbPath)

// 开启 WAL 模式：支持并发读写，显著提升多用户并发性能
sqlite.pragma('journal_mode = WAL')

// NORMAL 同步模式：在性能和安全性之间取得平衡
// 比 FULL 模式更快，同时保证数据完整性（只在电源故障时可能丢失少量数据）
sqlite.pragma('synchronous = NORMAL')

export const db = drizzle(sqlite, { schema })
