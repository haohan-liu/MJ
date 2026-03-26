-- 1. 给 workflow_runs 表添加 run_mode 字段
ALTER TABLE `workflow_runs` ADD COLUMN `run_mode` text DEFAULT 'normal' NOT NULL;

--> statement-breakpoint

-- 2. 从 workflow_runs 表删除不再使用的字段
ALTER TABLE `workflow_runs` DROP COLUMN `current_node_id`;

--> statement-breakpoint

ALTER TABLE `workflow_runs` DROP COLUMN `progress`;

--> statement-breakpoint

ALTER TABLE `workflow_runs` DROP COLUMN `node_results`;

--> statement-breakpoint

-- 3. 创建 workflow_run_nodes 表
CREATE TABLE `workflow_run_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`node_id` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`inputs` text,
	`outputs` text,
	`error` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL
);

--> statement-breakpoint

-- 4. 添加唯一约束
CREATE UNIQUE INDEX `workflow_run_nodes_run_id_node_id_unique` ON `workflow_run_nodes` (`run_id`, `node_id`);
