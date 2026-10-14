-- 0003 已应用，保留其历史；本迁移将最终企业模型收口为互相独立的企业。
-- 不自动转换已有父子关系，也不处理尚未确认的邀请数据。
LOCK TABLE "companies", "permissions", "menus", "roles", "role_permissions", "menu_versions", "permission_cleanup_tombstones" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "companies" WHERE "parent_company_id" IS NOT NULL) THEN
    RAISE EXCEPTION '企业独立化迁移已终止：存在企业父子关系，请先审阅存量关系处理方案';
  END IF;
  IF to_regclass('public.company_member_invitations') IS NOT NULL THEN
    RAISE EXCEPTION '企业独立化迁移已终止：存在未确认邀请表，请先审阅存量邀请数据处理方案';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "menus" child JOIN "menus" retired ON child."parent_id" = retired."id"
    WHERE retired."permission_key" = 'platform.companies.hierarchy'
  ) OR EXISTS (
    SELECT 1 FROM "permissions" WHERE "page_permission_key" = 'platform.companies.hierarchy'
  ) THEN
    RAISE EXCEPTION '企业独立化迁移已终止：旧企业层级权限存在自定义子项或权限引用，请先审阅配置处理方案';
  END IF;
END $$;--> statement-breakpoint
-- 仅删除取消功能的授权和菜单；保留其他权限、角色、用户关系及历史审计。
UPDATE "roles" SET "version" = "version" + 1, "updated_at" = now()
WHERE "id" IN (SELECT "role_id" FROM "role_permissions" WHERE "permission_key" = 'platform.companies.hierarchy');--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "permission_key" = 'platform.companies.hierarchy';--> statement-breakpoint
UPDATE "menu_versions" SET "version" = "version" + 1
WHERE "scope_type" IN (SELECT "scope_type" FROM "menus" WHERE "permission_key" = 'platform.companies.hierarchy');--> statement-breakpoint
DELETE FROM "menus" WHERE "permission_key" = 'platform.companies.hierarchy';--> statement-breakpoint
DELETE FROM "permissions" WHERE "key" = 'platform.companies.hierarchy';--> statement-breakpoint
INSERT INTO "permission_cleanup_tombstones" ("permission_key", "deployment_id")
VALUES ('platform.companies.hierarchy', 'migration:0006_independent_companies')
ON CONFLICT ("permission_key") DO NOTHING;--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "companies_parent_company_id_companies_id_fk";--> statement-breakpoint
DROP INDEX "companies_root_name_key_uq";--> statement-breakpoint
DROP INDEX "companies_parent_name_key_uq";--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "companies_name_key_normalized";--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "companies_sort_range";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "parent_company_id";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "entity_type";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "name_key";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "sort";--> statement-breakpoint
DROP TYPE "public"."company_entity_type";
