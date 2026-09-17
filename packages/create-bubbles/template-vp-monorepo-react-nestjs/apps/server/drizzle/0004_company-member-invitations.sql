CREATE TYPE "public"."company_member_invitation_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TABLE "company_member_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"status" "company_member_invitation_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_member_invitations_token_digest_length" CHECK (char_length("company_member_invitations"."token_digest") = 64),
	CONSTRAINT "company_member_invitations_version_positive" CHECK ("company_member_invitations"."version" > 0),
	CONSTRAINT "company_member_invitations_state_check" CHECK (("company_member_invitations"."status" = 'pending' AND "company_member_invitations"."accepted_by_user_id" IS NULL AND "company_member_invitations"."accepted_at" IS NULL AND "company_member_invitations"."revoked_at" IS NULL) OR ("company_member_invitations"."status" = 'accepted' AND "company_member_invitations"."accepted_by_user_id" IS NOT NULL AND "company_member_invitations"."accepted_at" IS NOT NULL AND "company_member_invitations"."revoked_at" IS NULL) OR ("company_member_invitations"."status" = 'revoked' AND "company_member_invitations"."accepted_by_user_id" IS NULL AND "company_member_invitations"."accepted_at" IS NULL AND "company_member_invitations"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "company_member_invitations" ADD CONSTRAINT "company_member_invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_member_invitations" ADD CONSTRAINT "company_member_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_member_invitations" ADD CONSTRAINT "company_member_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_member_invitations_token_digest_uq" ON "company_member_invitations" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "company_member_invitations_company_status_created_idx" ON "company_member_invitations" USING btree ("company_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "company_member_invitations_pending_expires_idx" ON "company_member_invitations" USING btree ("expires_at") WHERE "company_member_invitations"."status" = 'pending';