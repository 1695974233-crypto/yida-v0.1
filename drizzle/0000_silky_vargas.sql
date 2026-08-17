CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`outfit_key` text NOT NULL,
	`action` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `garments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`catalog_key` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`color` text NOT NULL,
	`color_name` text NOT NULL,
	`meta` text DEFAULT '' NOT NULL,
	`warmth` integer DEFAULT 2 NOT NULL,
	`style_tags` text DEFAULT '[]' NOT NULL,
	`scene_tags` text DEFAULT '[]' NOT NULL,
	`weather_tags` text DEFAULT '[]' NOT NULL,
	`is_virtual` integer DEFAULT true NOT NULL,
	`dirty_until` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_garments_user_catalog` ON `garments` (`user_id`,`catalog_key`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '晚晚' NOT NULL,
	`preferred_styles` text DEFAULT '["简约通勤","清爽休闲"]' NOT NULL,
	`last_scene` text,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
