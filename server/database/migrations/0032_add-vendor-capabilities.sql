-- 添加厂商和UI能力字段到 aimodels 表
ALTER TABLE aimodels ADD COLUMN vendor TEXT;
ALTER TABLE aimodels ADD COLUMN ui_capabilities TEXT;

-- 创建站点配置表
CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
