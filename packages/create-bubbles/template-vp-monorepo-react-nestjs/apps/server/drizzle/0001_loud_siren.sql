CREATE TYPE "public"."upload_status" AS ENUM('uploading', 'completing', 'completed', 'aborting', 'aborted', 'expired');--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"client_upload_id" uuid NOT NULL,
	"bucket" varchar(63) NOT NULL,
	"object_key" varchar(1024) NOT NULL,
	"storage_upload_id" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"file_size" bigint NOT NULL,
	"part_size" integer NOT NULL,
	"total_parts" integer NOT NULL,
	"status" "upload_status" DEFAULT 'uploading' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"object_etag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_sessions_owner_client_uq" ON "upload_sessions" USING btree ("owner_id","client_upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_sessions_bucket_key_uq" ON "upload_sessions" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE INDEX "upload_sessions_owner_status_expires_idx" ON "upload_sessions" USING btree ("owner_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "upload_sessions_status_expires_idx" ON "upload_sessions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "upload_sessions_status_updated_idx" ON "upload_sessions" USING btree ("status","updated_at");