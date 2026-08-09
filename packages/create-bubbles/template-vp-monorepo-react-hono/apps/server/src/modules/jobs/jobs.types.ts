export const DEMO_JOB_NAME = 'demo' as const

export interface DemoJobData {
  jobRunId: string
  payload: Record<string, unknown>
}

export interface DemoJobResult extends Record<string, unknown> {
  processedAt: string
  echo: Record<string, unknown>
}
