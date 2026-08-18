CREATE TABLE `recognition_usage` (
	`visitor_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`visitor_id`, `usage_date`)
);
