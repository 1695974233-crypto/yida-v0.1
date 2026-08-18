ALTER TABLE `garments` ADD `image_key` text;--> statement-breakpoint
ALTER TABLE `garments` ADD `processed_image_key` text;--> statement-breakpoint
ALTER TABLE `garments` ADD `recognition_status` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `garments` ADD `recognition_confidence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `garments` ADD `recognition_provider` text;--> statement-breakpoint
ALTER TABLE `garments` ADD `recognized_at` text;