CREATE TYPE "public"."job_run_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" varchar(100) NOT NULL,
	"job_name" varchar(100) NOT NULL,
	"status" "job_run_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "job_runs_status_created_at_idx" ON "job_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "job_runs_queue_name_idx" ON "job_runs" USING btree ("queue_name");