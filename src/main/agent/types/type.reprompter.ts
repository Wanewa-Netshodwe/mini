export interface ReprompterInput {
  task_id?: string
  step_number?: number
  step_goal?: string
  previous_attempt?: Record<string, unknown>
  failure_reason?: string
  context?: Record<string, unknown>
}
export interface ReprompterOutput {
  verdict: 'pass' | 'fail'
  data: Record<string, unknown>
  failure_reason?: string
  pause?: {
    reason: 'waiting_for_user_reply' | 'approval_pending'
    correlation_key?: string
  }
}
