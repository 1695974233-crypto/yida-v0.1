CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_user_created` ON `chat_messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active_request` text,
	`constraints` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
