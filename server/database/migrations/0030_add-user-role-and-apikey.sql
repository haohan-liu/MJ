-- 添加用户角色和API Key相关字段
-- 添加 username 字段（管理员账号）
ALTER TABLE users ADD COLUMN username TEXT;
--> statement-breakpoint

-- 添加 role 字段（用户角色：admin/user）
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' NOT NULL;
--> statement-breakpoint

-- 添加 api_key 字段（用户端API Key）
ALTER TABLE users ADD COLUMN api_key TEXT;
--> statement-breakpoint

-- 创建 username 唯一索引
CREATE UNIQUE INDEX users_username_unique ON users (username);
