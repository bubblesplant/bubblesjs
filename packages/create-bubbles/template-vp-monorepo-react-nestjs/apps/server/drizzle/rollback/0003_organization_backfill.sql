-- 该脚本只回滚 0003 迁移创建的空组织树，不回滚表结构。
-- 如任一批次树已经包含组织单元或成员关系，脚本会整体终止并要求人工审阅。
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "organization_trees" AS tree
		WHERE tree."backfill_batch_key" = 'organization-v1-20260916'
			AND (
				EXISTS (
					SELECT 1
					FROM "organization_units" AS unit
					WHERE unit."tree_id" = tree."id"
				)
				OR EXISTS (
					SELECT 1
					FROM "company_organization_unit_members" AS relation
					WHERE relation."tree_id" = tree."id"
				)
				OR EXISTS (
					SELECT 1
					FROM "project_organization_unit_members" AS relation
					WHERE relation."tree_id" = tree."id"
				)
			)
	) THEN
		RAISE EXCEPTION '拒绝自动回滚：organization-v1-20260916 批次中已有组织单元或业务引用，请人工审阅';
	END IF;

	DELETE FROM "organization_trees"
	WHERE "backfill_batch_key" = 'organization-v1-20260916';
END $$;
