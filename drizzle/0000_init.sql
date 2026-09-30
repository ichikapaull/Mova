CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (lower("name"));--> statement-breakpoint
CREATE TABLE `collection_items` (
	`collection_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `media_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_items_media_idx` ON `collection_items` (`media_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`absolute_path` text NOT NULL,
	`relative_path` text NOT NULL,
	`filename` text NOT NULL,
	`extension` text NOT NULL,
	`display_title` text NOT NULL,
	`notes` text,
	`search_text` text NOT NULL,
	`file_size` integer NOT NULL,
	`file_modified_at` integer NOT NULL,
	`file_created_at` integer,
	`duration_sec` real,
	`width` integer,
	`height` integer,
	`video_codec` text,
	`audio_codec` text,
	`container_format` text,
	`fps` real,
	`bitrate` integer,
	`probe_status` text DEFAULT 'pending' NOT NULL,
	`probe_error` text,
	`thumbnail_status` text DEFAULT 'pending' NOT NULL,
	`thumbnail_error` text,
	`preview_status` text DEFAULT 'pending' NOT NULL,
	`preview_error` text,
	`status` text DEFAULT 'available' NOT NULL,
	`missing_since` integer,
	`is_favorite` integer DEFAULT false NOT NULL,
	`favorited_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`indexed_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `media_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_absolute_path_unique` ON `media` (`absolute_path`);--> statement-breakpoint
CREATE INDEX `media_source_idx` ON `media` (`source_id`);--> statement-breakpoint
CREATE INDEX `media_status_idx` ON `media` (`status`);--> statement-breakpoint
CREATE INDEX `media_created_idx` ON `media` (`created_at`);--> statement-breakpoint
CREATE INDEX `media_title_idx` ON `media` (`display_title`);--> statement-breakpoint
CREATE INDEX `media_favorite_idx` ON `media` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `media_size_mtime_idx` ON `media` (`file_size`,`file_modified_at`);--> statement-breakpoint
CREATE TABLE `media_categories` (
	`media_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`media_id`, `category_id`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_categories_category_idx` ON `media_categories` (`category_id`);--> statement-breakpoint
CREATE TABLE `media_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_media_id` integer NOT NULL,
	`target_media_id` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_relations_unique` ON `media_relations` (`source_media_id`,`target_media_id`,`type`);--> statement-breakpoint
CREATE INDEX `media_relations_target_idx` ON `media_relations` (`target_media_id`);--> statement-breakpoint
CREATE TABLE `media_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`default_category_id` integer,
	`is_online` integer DEFAULT true NOT NULL,
	`last_scan_at` integer,
	`last_scan_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`default_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_sources_path_unique` ON `media_sources` (`path`);--> statement-breakpoint
CREATE TABLE `media_tags` (
	`media_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`media_id`, `tag_id`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_tags_tag_idx` ON `media_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`poster_media_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`poster_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `series_episodes` (
	`series_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`season_number` integer,
	`episode_number` real,
	`position` integer NOT NULL,
	PRIMARY KEY(`series_id`, `media_id`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_episodes_media_id_unique` ON `series_episodes` (`media_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (lower("name"));--> statement-breakpoint
CREATE TABLE `watch_history` (
	`media_id` integer PRIMARY KEY NOT NULL,
	`position_sec` real DEFAULT 0 NOT NULL,
	`duration_sec` real,
	`completed` integer DEFAULT false NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`last_watched_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watch_history_last_watched_idx` ON `watch_history` (`last_watched_at`);