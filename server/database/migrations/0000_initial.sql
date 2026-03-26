CREATE TABLE `aimodels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`upstream_id` integer NOT NULL,
	`category` text NOT NULL,
	`model_type` text NOT NULL,
	`api_format` text NOT NULL,
	`model_name` text NOT NULL,
	`estimated_time` integer DEFAULT 60 NOT NULL,
	`key_name` text DEFAULT 'default' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `assistants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`avatar` text,
	`system_prompt` text,
	`upstream_id` integer,
	`aimodel_id` integer,
	`model_name` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`assistant_id` integer NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`files` text,
	`upstream_id` integer,
	`aimodel_id` integer,
	`model_name` text,
	`mark` text,
	`status` text,
	`sort_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`upstream_id` integer NOT NULL,
	`aimodel_id` integer NOT NULL,
	`model_type` text NOT NULL,
	`api_format` text NOT NULL,
	`model_name` text NOT NULL,
	`prompt` text,
	`negative_prompt` text,
	`images` text DEFAULT '[]',
	`type` text DEFAULT 'imagine' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`upstream_task_id` text,
	`progress` text,
	`image_url` text,
	`error` text,
	`is_blurred` integer DEFAULT true NOT NULL,
	`unique_id` text,
	`source_type` text DEFAULT 'workbench',
	`buttons` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `upstreams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`api_keys` text,
	`remark` text,
	`sort_order` integer DEFAULT 999 NOT NULL,
	`upstream_platform` text,
	`user_api_key` text,
	`upstream_info` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_key_unique` ON `user_settings` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`password` text,
	`name` text,
	`avatar` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);