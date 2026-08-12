interface PlannerStep {
  step_number?: number
  goal?: string
  status?: string
  data_needed?: string[]
  data_received?: Record<string, unknown>
  tool?: string
  tool_arguments?: Record<string, unknown>
  requires_isolation?: boolean
  verdict?: 'pass' | 'fail' | null
  failure_reason?: string | null
}

interface PlannerTask {
  task_id?: string
  goal?: string
  status?: string
  failure_count?: number
  max_retries?: number
  steps?: PlannerStep[]
  current_step?: number
  depends_on?: string[]
}

interface PlannerSession {
  session_id?: string
  title?: string
  main_goal?: string
  status?: string
  current_task?: PlannerTask
  next_tasks?: PlannerTask[]
  task_history?: unknown[]
  is_followup?: boolean
  conversation_log?: unknown[]
  main_goal_completed?: boolean
}

export type { PlannerStep, PlannerTask, PlannerSession }
