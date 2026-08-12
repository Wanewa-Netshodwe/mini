export interface HarnessCallbacks {
  onStepStart?: (info: {
    session_id: string
    task_id: string
    task_goal: string
    step_number: number
    step_goal: string
    handler: string
  }) => void
  onStepEnd?: (info: {
    task_id: string
    step_number: number
    handler: string
    verdict: 'pass' | 'fail' | null
    failure_reason?: string | null
  }) => void
  onTaskEnd?: (info: {
    task_id: string
    task_goal: string
    status: 'completed' | 'failed' | 'escalated'
    outputs?: Record<string, unknown>
    failure_reason?: string | null
  }) => void
}
