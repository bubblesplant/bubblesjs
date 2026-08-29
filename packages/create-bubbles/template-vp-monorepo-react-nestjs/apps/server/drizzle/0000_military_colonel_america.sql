CREATE TYPE "public"."user_status" AS ENUM('active', 'locked', 'disabled');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"account" varchar(32) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"create_at" timestamp DEFAULT now() NOT NULL,
	"update_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_account_unique" UNIQUE("account")
);
