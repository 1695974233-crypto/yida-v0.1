CREATE TABLE `external_identity_links` (
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`data_user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`provider`, `provider_user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_external_identity_email` ON `external_identity_links` (`email`);--> statement-breakpoint
CREATE INDEX `idx_external_identity_data_user` ON `external_identity_links` (`data_user_id`);