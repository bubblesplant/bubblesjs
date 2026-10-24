import { z } from 'zod'
import type { AdministratorSummary, CompanyDetail, PageResult } from 'shared/types'

const administratorSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  account: z.string(),
  accountStatus: z.enum(['active', 'locked', 'disabled']),
  memberStatus: z.enum(['active', 'disabled']),
  effective: z.boolean(),
}) satisfies z.ZodType<AdministratorSummary>

const companyDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  description: z.string(),
  status: z.enum(['active', 'disabled']),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  administrators: z.array(administratorSummarySchema),
}) satisfies z.ZodType<CompanyDetail>

export const companyPageResponseSchema = z.object({
  items: z.array(companyDetailSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
}) satisfies z.ZodType<PageResult<CompanyDetail>>
