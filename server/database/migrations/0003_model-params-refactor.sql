ALTER TABLE `tasks` ADD COLUMN `model_params` TEXT;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `negative_prompt`;--> statement-breakpoint
DROP TABLE IF EXISTS `task_video`;
