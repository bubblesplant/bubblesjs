CREATE TABLE "dictionaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "access_scope_type" NOT NULL,
	"company_id" uuid,
	"project_id" uuid,
	"code" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "access_status" DEFAULT 'active' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionaries_scope_valid" CHECK ((
    ("dictionaries"."scope_type" = 'platform' AND "dictionaries"."company_id" IS NULL AND "dictionaries"."project_id" IS NULL) OR
    ("dictionaries"."scope_type" = 'company' AND "dictionaries"."company_id" IS NOT NULL AND "dictionaries"."project_id" IS NULL) OR
    ("dictionaries"."scope_type" = 'project' AND "dictionaries"."company_id" IS NOT NULL AND "dictionaries"."project_id" IS NOT NULL)
  )),
	CONSTRAINT "dictionaries_code_valid" CHECK ("dictionaries"."code" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "dictionaries_version_positive" CHECK ("dictionaries"."version" > 0),
	CONSTRAINT "dictionaries_items_valid" CHECK (jsonb_typeof("dictionaries"."items") = 'array' AND jsonb_array_length("dictionaries"."items") <= 500)
);
--> statement-breakpoint
ALTER TABLE "dictionaries" ADD CONSTRAINT "dictionaries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionaries" ADD CONSTRAINT "dictionaries_project_company_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."projects"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dictionaries_platform_code_uq" ON "dictionaries" USING btree ("code") WHERE "dictionaries"."scope_type" = 'platform';--> statement-breakpoint
CREATE UNIQUE INDEX "dictionaries_company_code_uq" ON "dictionaries" USING btree ("company_id","code") WHERE "dictionaries"."scope_type" = 'company';--> statement-breakpoint
CREATE UNIQUE INDEX "dictionaries_project_code_uq" ON "dictionaries" USING btree ("company_id","project_id","code") WHERE "dictionaries"."scope_type" = 'project';