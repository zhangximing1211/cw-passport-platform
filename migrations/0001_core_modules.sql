CREATE TABLE `companies` (
	`name` text PRIMARY KEY NOT NULL,
	`industry` text NOT NULL,
	`region` text NOT NULL,
	`region_code` text NOT NULL,
	`needs` text NOT NULL,
	`capacity` text NOT NULL,
	`history` text NOT NULL,
	`rating` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `demands` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`industry` text NOT NULL,
	`region` text NOT NULL,
	`category` text NOT NULL,
	`quantity_value` real NOT NULL,
	`quantity_unit` text DEFAULT 't' NOT NULL,
	`deadline` text NOT NULL,
	`contact` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`company`) REFERENCES `companies`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`passport_id` text NOT NULL,
	`transfer_id` text,
	`material` text NOT NULL,
	`category` text NOT NULL,
	`quantity_value` real NOT NULL,
	`quantity_unit` text DEFAULT 't' NOT NULL,
	`location` text NOT NULL,
	`available_from` text,
	`status` text NOT NULL,
	`seller` text NOT NULL,
	`tone` text NOT NULL,
	`nft_token_id` text NOT NULL,
	`nft_type` text NOT NULL,
	`mint_status` text DEFAULT 'draft' NOT NULL,
	`tx_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`passport_id`) REFERENCES `passports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listings_nft_token_id_unique` ON `listings` (`nft_token_id`);--> statement-breakpoint
CREATE INDEX `listings_category_idx` ON `listings` (`category`);--> statement-breakpoint
CREATE INDEX `listings_passport_idx` ON `listings` (`passport_id`);--> statement-breakpoint
CREATE TABLE `passport_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`passport_id` text NOT NULL,
	`stage` text NOT NULL,
	`occurred_at` text NOT NULL,
	`place` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`passport_id`) REFERENCES `passports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passport_events_passport_idx` ON `passport_events` (`passport_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`demand_id` text NOT NULL,
	`buyer` text NOT NULL,
	`seller` text NOT NULL,
	`quantity_value` real NOT NULL,
	`quantity_unit` text DEFAULT 't' NOT NULL,
	`price_hkd` integer NOT NULL,
	`status` text NOT NULL,
	`tx_hash` text,
	`traded_on` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trades_traded_on_idx` ON `trades` (`traded_on`);--> statement-breakpoint
CREATE TABLE `transfer_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transfer_id` text NOT NULL,
	`step` text NOT NULL,
	`occurred_at` text NOT NULL,
	`note` text NOT NULL,
	FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transfer_events_transfer_idx` ON `transfer_events` (`transfer_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`passport_id` text NOT NULL,
	`material` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`quantity_value` real NOT NULL,
	`quantity_unit` text DEFAULT 't' NOT NULL,
	`departure_date` text NOT NULL,
	`compliance` text NOT NULL,
	`status` text NOT NULL,
	`transport_type` text NOT NULL,
	`organisation` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`passport_id`) REFERENCES `passports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transfers_passport_idx` ON `transfers` (`passport_id`);--> statement-breakpoint
CREATE INDEX `transfers_status_idx` ON `transfers` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`company` text NOT NULL,
	`user_type` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`contact` text,
	`phone` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (lower("email"));