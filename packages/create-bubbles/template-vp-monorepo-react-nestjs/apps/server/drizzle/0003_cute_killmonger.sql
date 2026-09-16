DO $$
DECLARE
	invalid_company_code_ids text;
	invalid_project_code_ids text;
	duplicate_company_code_ids text;
	duplicate_project_code_ids text;
	duplicate_company_name_ids text;
BEGIN
	SELECT string_agg(id::text, ', ' ORDER BY id::text)
	INTO invalid_company_code_ids
	FROM "companies"
	WHERE char_length(btrim("code")) NOT BETWEEN 2 AND 32
		OR btrim("code") !~ '^[A-Za-z0-9_-]+$';

	IF invalid_company_code_ids IS NOT NULL THEN
		RAISE EXCEPTION '组织架构迁移已终止：以下企业 code 不符合 2～32 位 ASCII 字母、数字、下划线或短横线规则：%', invalid_company_code_ids;
	END IF;

	SELECT string_agg(id::text, ', ' ORDER BY id::text)
	INTO invalid_project_code_ids
	FROM "projects"
	WHERE char_length(btrim("code")) NOT BETWEEN 2 AND 32
		OR btrim("code") !~ '^[A-Za-z0-9_-]+$';

	IF invalid_project_code_ids IS NOT NULL THEN
		RAISE EXCEPTION '组织架构迁移已终止：以下项目 code 不符合 2～32 位 ASCII 字母、数字、下划线或短横线规则：%', invalid_project_code_ids;
	END IF;

	SELECT string_agg(company.id::text, ', ' ORDER BY company.id::text)
	INTO duplicate_company_code_ids
	FROM "companies" AS company
	INNER JOIN (
		SELECT lower(normalize(btrim("code"), NFKC)) AS normalized_code
		FROM "companies"
		GROUP BY lower(normalize(btrim("code"), NFKC))
		HAVING count(*) > 1
	) AS duplicate
		ON duplicate.normalized_code = lower(normalize(btrim(company."code"), NFKC));

	IF duplicate_company_code_ids IS NOT NULL THEN
		RAISE EXCEPTION '组织架构迁移已终止：以下企业 code 在 NFKC + 不区分大小写后冲突：%', duplicate_company_code_ids;
	END IF;

	SELECT string_agg(project.id::text, ', ' ORDER BY project.id::text)
	INTO duplicate_project_code_ids
	FROM "projects" AS project
	INNER JOIN (
		SELECT "company_id", lower(normalize(btrim("code"), NFKC)) AS normalized_code
		FROM "projects"
		GROUP BY "company_id", lower(normalize(btrim("code"), NFKC))
		HAVING count(*) > 1
	) AS duplicate
		ON duplicate."company_id" = project."company_id"
		AND duplicate.normalized_code = lower(normalize(btrim(project."code"), NFKC));

	IF duplicate_project_code_ids IS NOT NULL THEN
		RAISE EXCEPTION '组织架构迁移已终止：以下项目 code 在所属企业内按 NFKC + 不区分大小写后冲突：%', duplicate_project_code_ids;
	END IF;

	SELECT string_agg(company.id::text, ', ' ORDER BY company.id::text)
	INTO duplicate_company_name_ids
	FROM "companies" AS company
	INNER JOIN (
		SELECT lower(normalize(btrim("name"), NFKC)) AS normalized_name
		FROM "companies"
		GROUP BY lower(normalize(btrim("name"), NFKC))
		HAVING count(*) > 1
	) AS duplicate
		ON duplicate.normalized_name = lower(normalize(btrim(company."name"), NFKC));

	IF duplicate_company_name_ids IS NOT NULL THEN
		RAISE EXCEPTION '组织架构迁移已终止：以下根级企业名称在 NFKC + 不区分大小写后冲突：%', duplicate_company_name_ids;
	END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."company_entity_type" AS ENUM('group', 'company');--> statement-breakpoint
CREATE TYPE "public"."organization_duty" AS ENUM('member', 'leader', 'deputy');--> statement-breakpoint
CREATE TABLE "company_organization_unit_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "access_scope_type" DEFAULT 'company' NOT NULL,
	"company_id" uuid NOT NULL,
	"tree_id" uuid NOT NULL,
	"organization_unit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"duty" "organization_duty" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_organization_members_member_unit_uq" UNIQUE("user_id","organization_unit_id"),
	CONSTRAINT "company_organization_members_scope_check" CHECK ("company_organization_unit_members"."scope_type" = 'company')
);
--> statement-breakpoint
CREATE TABLE "company_position_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "access_scope_type" DEFAULT 'company' NOT NULL,
	"company_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_position_members_user_position_uq" UNIQUE("user_id","position_id"),
	CONSTRAINT "company_position_members_scope_check" CHECK ("company_position_members"."scope_type" = 'company')
);
--> statement-breakpoint
CREATE TABLE "organization_template_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"name_key" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"code_key" varchar(32) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"status" "access_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_template_positions_name_length" CHECK (char_length("organization_template_positions"."name") BETWEEN 2 AND 100),
	CONSTRAINT "organization_template_positions_name_key_normalized" CHECK ("organization_template_positions"."name_key" = lower(normalize(btrim("organization_template_positions"."name"), NFKC))),
	CONSTRAINT "organization_template_positions_code_check" CHECK (char_length("organization_template_positions"."code") BETWEEN 2 AND 32 AND "organization_template_positions"."code" ~ '^[a-z0-9_-]+$'),
	CONSTRAINT "organization_template_positions_code_key_normalized" CHECK ("organization_template_positions"."code_key" = lower(normalize(btrim("organization_template_positions"."code"), NFKC))),
	CONSTRAINT "organization_template_positions_version_positive" CHECK ("organization_template_positions"."template_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_template_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"parent_id" uuid,
	"name" varchar(100) NOT NULL,
	"name_key" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"code_key" varchar(32) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"sort" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_template_units_version_id_uq" UNIQUE("template_id","template_version","id"),
	CONSTRAINT "organization_template_units_name_length" CHECK (char_length("organization_template_units"."name") BETWEEN 2 AND 100),
	CONSTRAINT "organization_template_units_name_key_normalized" CHECK ("organization_template_units"."name_key" = lower(normalize(btrim("organization_template_units"."name"), NFKC))),
	CONSTRAINT "organization_template_units_code_check" CHECK (char_length("organization_template_units"."code") BETWEEN 2 AND 32 AND "organization_template_units"."code" ~ '^[a-z0-9_-]+$'),
	CONSTRAINT "organization_template_units_code_key_normalized" CHECK ("organization_template_units"."code_key" = lower(normalize(btrim("organization_template_units"."code"), NFKC))),
	CONSTRAINT "organization_template_units_sort_range" CHECK ("organization_template_units"."sort" BETWEEN 0 AND 999999999),
	CONSTRAINT "organization_template_units_version_positive" CHECK ("organization_template_units"."template_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"name_key" text NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"status" "access_status" DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_templates_name_length" CHECK (char_length("organization_templates"."name") BETWEEN 2 AND 100),
	CONSTRAINT "organization_templates_name_key_normalized" CHECK ("organization_templates"."name_key" = lower(normalize(btrim("organization_templates"."name"), NFKC))),
	CONSTRAINT "organization_templates_version_positive" CHECK ("organization_templates"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_trees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "access_scope_type" NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"backfill_batch_key" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_trees_company_ref_uq" UNIQUE("id","scope_type","company_id"),
	CONSTRAINT "organization_trees_project_ref_uq" UNIQUE("id","scope_type","company_id","project_id"),
	CONSTRAINT "organization_trees_scope_check" CHECK (("organization_trees"."scope_type" = 'company' AND "organization_trees"."project_id" IS NULL) OR ("organization_trees"."scope_type" = 'project' AND "organization_trees"."project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "organization_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(100) NOT NULL,
	"name_key" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"code_key" varchar(32) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"sort" integer NOT NULL,
	"status" "access_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_template_unit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_units_tree_id_uq" UNIQUE("tree_id","id"),
	CONSTRAINT "organization_units_name_length" CHECK (char_length("organization_units"."name") BETWEEN 2 AND 100),
	CONSTRAINT "organization_units_name_key_normalized" CHECK ("organization_units"."name_key" = lower(normalize(btrim("organization_units"."name"), NFKC))),
	CONSTRAINT "organization_units_code_check" CHECK (char_length("organization_units"."code") BETWEEN 2 AND 32 AND "organization_units"."code" ~ '^[a-z0-9_-]+$'),
	CONSTRAINT "organization_units_code_key_normalized" CHECK ("organization_units"."code_key" = lower(normalize(btrim("organization_units"."code"), NFKC))),
	CONSTRAINT "organization_units_sort_range" CHECK ("organization_units"."sort" BETWEEN 0 AND 999999999),
	CONSTRAINT "organization_units_version_positive" CHECK ("organization_units"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "access_scope_type" NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"name" varchar(100) NOT NULL,
	"name_key" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"code_key" varchar(32) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"status" "access_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_template_position_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_company_ref_uq" UNIQUE("id","scope_type","company_id"),
	CONSTRAINT "positions_project_ref_uq" UNIQUE("id","scope_type","company_id","project_id"),
	CONSTRAINT "positions_scope_check" CHECK (("positions"."scope_type" = 'company' AND "positions"."project_id" IS NULL) OR ("positions"."scope_type" = 'project' AND "positions"."project_id" IS NOT NULL)),
	CONSTRAINT "positions_name_length" CHECK (char_length("positions"."name") BETWEEN 2 AND 100),
	CONSTRAINT "positions_name_key_normalized" CHECK ("positions"."name_key" = lower(normalize(btrim("positions"."name"), NFKC))),
	CONSTRAINT "positions_code_check" CHECK (char_length("positions"."code") BETWEEN 2 AND 32 AND "positions"."code" ~ '^[a-z0-9_-]+$'),
	CONSTRAINT "positions_code_key_normalized" CHECK ("positions"."code_key" = lower(normalize(btrim("positions"."code"), NFKC))),
	CONSTRAINT "positions_version_positive" CHECK ("positions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_organization_unit_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "access_scope_type" DEFAULT 'project' NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tree_id" uuid NOT NULL,
	"organization_unit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"duty" "organization_duty" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_organization_members_member_unit_uq" UNIQUE("user_id","organization_unit_id"),
	CONSTRAINT "project_organization_members_scope_check" CHECK ("project_organization_unit_members"."scope_type" = 'project')
);
--> statement-breakpoint
CREATE TABLE "project_position_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "access_scope_type" DEFAULT 'project' NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_position_members_user_position_uq" UNIQUE("user_id","position_id"),
	CONSTRAINT "project_position_members_scope_check" CHECK ("project_position_members"."scope_type" = 'project')
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "parent_company_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "entity_type" "company_entity_type";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "name_key" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sort" integer;--> statement-breakpoint
UPDATE "companies"
SET "entity_type" = 'company',
	"name_key" = lower(normalize(btrim("name"), NFKC));--> statement-breakpoint
WITH stable_company_sort AS (
	SELECT "id", row_number() OVER (ORDER BY "id")::integer AS "sort"
	FROM "companies"
)
UPDATE "companies" AS company
SET "sort" = stable_company_sort."sort"
FROM stable_company_sort
WHERE company."id" = stable_company_sort."id";--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "entity_type" SET DEFAULT 'company';--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "entity_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "sort" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "sort" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_organization_unit_members" ADD CONSTRAINT "company_organization_unit_members_tree_id_scope_type_company_id_organization_trees_id_scope_type_company_id_fk" FOREIGN KEY ("tree_id","scope_type","company_id") REFERENCES "public"."organization_trees"("id","scope_type","company_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_organization_unit_members" ADD CONSTRAINT "company_organization_unit_members_tree_id_organization_unit_id_organization_units_tree_id_id_fk" FOREIGN KEY ("tree_id","organization_unit_id") REFERENCES "public"."organization_units"("tree_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_organization_unit_members" ADD CONSTRAINT "company_organization_unit_members_company_id_user_id_company_members_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."company_members"("company_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_position_members" ADD CONSTRAINT "company_position_members_position_id_scope_type_company_id_positions_id_scope_type_company_id_fk" FOREIGN KEY ("position_id","scope_type","company_id") REFERENCES "public"."positions"("id","scope_type","company_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_position_members" ADD CONSTRAINT "company_position_members_company_id_user_id_company_members_company_id_user_id_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "public"."company_members"("company_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_template_positions" ADD CONSTRAINT "organization_template_positions_template_id_organization_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."organization_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_template_units" ADD CONSTRAINT "organization_template_units_template_id_organization_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."organization_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_template_units" ADD CONSTRAINT "organization_template_units_template_id_template_version_parent_id_organization_template_units_template_id_template_version_id_fk" FOREIGN KEY ("template_id","template_version","parent_id") REFERENCES "public"."organization_template_units"("template_id","template_version","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_templates" ADD CONSTRAINT "organization_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_trees" ADD CONSTRAINT "organization_trees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_trees" ADD CONSTRAINT "organization_trees_company_id_project_id_projects_company_id_id_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."projects"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_tree_id_organization_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."organization_trees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_tree_id_parent_id_organization_units_tree_id_id_fk" FOREIGN KEY ("tree_id","parent_id") REFERENCES "public"."organization_units"("tree_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_source_template_unit_id_organization_template_units_id_fk" FOREIGN KEY ("source_template_unit_id") REFERENCES "public"."organization_template_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_project_id_projects_company_id_id_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."projects"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_source_template_position_id_organization_template_positions_id_fk" FOREIGN KEY ("source_template_position_id") REFERENCES "public"."organization_template_positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_organization_unit_members" ADD CONSTRAINT "project_organization_unit_members_tree_id_scope_type_company_id_project_id_organization_trees_id_scope_type_company_id_project_id_fk" FOREIGN KEY ("tree_id","scope_type","company_id","project_id") REFERENCES "public"."organization_trees"("id","scope_type","company_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_organization_unit_members" ADD CONSTRAINT "project_organization_unit_members_tree_id_organization_unit_id_organization_units_tree_id_id_fk" FOREIGN KEY ("tree_id","organization_unit_id") REFERENCES "public"."organization_units"("tree_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_organization_unit_members" ADD CONSTRAINT "project_organization_unit_members_project_id_user_id_project_members_project_id_user_id_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_position_members" ADD CONSTRAINT "project_position_members_position_id_scope_type_company_id_project_id_positions_id_scope_type_company_id_project_id_fk" FOREIGN KEY ("position_id","scope_type","company_id","project_id") REFERENCES "public"."positions"("id","scope_type","company_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_position_members" ADD CONSTRAINT "project_position_members_project_id_user_id_project_members_project_id_user_id_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_organization_members_leader_uq" ON "company_organization_unit_members" USING btree ("organization_unit_id") WHERE "company_organization_unit_members"."duty" = 'leader';--> statement-breakpoint
CREATE INDEX "company_organization_members_user_idx" ON "company_organization_unit_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "company_position_members_position_idx" ON "company_position_members" USING btree ("position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_template_positions_version_name_uq" ON "organization_template_positions" USING btree ("template_id","template_version","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_template_positions_version_code_uq" ON "organization_template_positions" USING btree ("template_id","template_version","code_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_template_units_version_code_uq" ON "organization_template_units" USING btree ("template_id","template_version","code_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_template_units_root_name_uq" ON "organization_template_units" USING btree ("template_id","template_version","name_key") WHERE "organization_template_units"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_template_units_parent_name_uq" ON "organization_template_units" USING btree ("template_id","template_version","parent_id","name_key") WHERE "organization_template_units"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_templates_company_name_key_uq" ON "organization_templates" USING btree ("company_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_templates_company_default_uq" ON "organization_templates" USING btree ("company_id") WHERE "organization_templates"."status" = 'active' AND "organization_templates"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_trees_company_scope_uq" ON "organization_trees" USING btree ("company_id") WHERE "organization_trees"."scope_type" = 'company';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_trees_project_scope_uq" ON "organization_trees" USING btree ("project_id") WHERE "organization_trees"."scope_type" = 'project';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_units_tree_code_key_uq" ON "organization_units" USING btree ("tree_id","code_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_units_root_name_key_uq" ON "organization_units" USING btree ("tree_id","name_key") WHERE "organization_units"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_units_parent_name_key_uq" ON "organization_units" USING btree ("tree_id","parent_id","name_key") WHERE "organization_units"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "organization_units_tree_parent_sort_idx" ON "organization_units" USING btree ("tree_id","parent_id","sort","id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_company_name_key_uq" ON "positions" USING btree ("company_id","name_key") WHERE "positions"."scope_type" = 'company';--> statement-breakpoint
CREATE UNIQUE INDEX "positions_company_code_key_uq" ON "positions" USING btree ("company_id","code_key") WHERE "positions"."scope_type" = 'company';--> statement-breakpoint
CREATE UNIQUE INDEX "positions_project_name_key_uq" ON "positions" USING btree ("project_id","name_key") WHERE "positions"."scope_type" = 'project';--> statement-breakpoint
CREATE UNIQUE INDEX "positions_project_code_key_uq" ON "positions" USING btree ("project_id","code_key") WHERE "positions"."scope_type" = 'project';--> statement-breakpoint
CREATE INDEX "positions_scope_created_idx" ON "positions" USING btree ("scope_type","company_id","project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_organization_members_leader_uq" ON "project_organization_unit_members" USING btree ("organization_unit_id") WHERE "project_organization_unit_members"."duty" = 'leader';--> statement-breakpoint
CREATE INDEX "project_organization_members_user_idx" ON "project_organization_unit_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_position_members_position_idx" ON "project_position_members" USING btree ("position_id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_company_id_companies_id_fk" FOREIGN KEY ("parent_company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_root_name_key_uq" ON "companies" USING btree ("name_key") WHERE "companies"."parent_company_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_parent_name_key_uq" ON "companies" USING btree ("parent_company_id","name_key") WHERE "companies"."parent_company_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_code_normalized_uq" ON "companies" USING btree (lower(normalize(btrim("code"), NFKC)));--> statement-breakpoint
CREATE UNIQUE INDEX "projects_company_code_normalized_uq" ON "projects" USING btree ("company_id",lower(normalize(btrim("code"), NFKC)));--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "companies_code_unique";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_company_code_uq";--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_name_key_normalized" CHECK ("companies"."name_key" = lower(normalize(btrim("companies"."name"), NFKC)));--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_sort_range" CHECK ("companies"."sort" BETWEEN 0 AND 999999999);--> statement-breakpoint
INSERT INTO "organization_trees" (
	"scope_type",
	"company_id",
	"project_id",
	"backfill_batch_key"
)
SELECT
	'company',
	company."id",
	NULL,
	'organization-v1-20260916'
FROM "companies" AS company
WHERE NOT EXISTS (
	SELECT 1
	FROM "organization_trees" AS tree
	WHERE tree."scope_type" = 'company'
		AND tree."company_id" = company."id"
)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "organization_trees" (
	"scope_type",
	"company_id",
	"project_id",
	"backfill_batch_key"
)
SELECT
	'project',
	project."company_id",
	project."id",
	'organization-v1-20260916'
FROM "projects" AS project
WHERE NOT EXISTS (
	SELECT 1
	FROM "organization_trees" AS tree
	WHERE tree."scope_type" = 'project'
		AND tree."project_id" = project."id"
)
ON CONFLICT DO NOTHING;
