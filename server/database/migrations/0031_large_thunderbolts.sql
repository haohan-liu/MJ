CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`type` text DEFAULT 'info' NOT NULL,
	`icon` text,
	`link` text,
	`link_text` text,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_settings_key_unique` ON `site_settings` (`key`);--> statement-breakpoint
CREATE TABLE `uploaded_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`url` text NOT NULL,
	`storage` text DEFAULT 'local' NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `aimodels` ADD `vendor` text;--> statement-breakpoint
ALTER TABLE `aimodels` ADD `ui_capabilities` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `resource_storage` text DEFAULT 'local';--> statement-breakpoint
ALTER TABLE `tasks` ADD `resource_deleted` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `upstreams` ADD `show_user_balance` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `upstreams` DROP COLUMN `user_api_key`;