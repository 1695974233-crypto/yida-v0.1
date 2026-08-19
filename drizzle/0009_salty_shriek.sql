CREATE TABLE `account_links` (
	`auth_user_id` text PRIMARY KEY NOT NULL,
	`data_user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_links_data_user` ON `account_links` (`data_user_id`);
--> statement-breakpoint
UPDATE `visualization_usage` SET `count` = 0, `updated_at` = CURRENT_TIMESTAMP;
