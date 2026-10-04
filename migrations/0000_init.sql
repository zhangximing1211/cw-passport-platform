CREATE TABLE `passports` (
	`id` text PRIMARY KEY NOT NULL,
	`material` text NOT NULL,
	`category` text NOT NULL,
	`project` text NOT NULL,
	`quantity_value` real NOT NULL,
	`quantity_unit` text DEFAULT 't' NOT NULL,
	`location` text NOT NULL,
	`origin` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `passports_category_idx` ON `passports` (`category`);--> statement-breakpoint
CREATE INDEX `passports_status_idx` ON `passports` (`status`);--> statement-breakpoint
CREATE INDEX `passports_updated_at_idx` ON `passports` (`updated_at`);