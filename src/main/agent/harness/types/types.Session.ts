interface Step {
  step_number: number
  goal: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused'
  data_needed: string[]
  data_received: Record<string, unknown>
  handler: string
  requires_isolation: boolean
  verdict: 'pass' | 'fail' | null
  failure_reason: string | null
}

interface Task {
  task_id: string
  goal: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  failure_count: number
  max_retries: number
  steps: Step[]
  current_step: number
}

interface TaskHistoryEntry {
  task_id: string
  goal: string
  status: 'completed' | 'failed' | 'escalated'
  completed_at: string
  outputs?: Record<string, unknown>
}
interface PendingReply {
  task_id: string
  step_number: number
  correlation_key: string
  deadline: string | null
}
interface ConversationTurn {
  turn: number
  user_prompt: string
  ai_response: string
  timestamp: string
}
interface Session {
  session_id: string
  title: string
  main_goal: string
  status: 'active' | 'paused' | 'waiting_for_user_reply' | 'completed' | 'escalated'
  current_task: Task
  task_history: TaskHistoryEntry[]
  is_followup: boolean
  conversation_log: ConversationTurn[]
  main_goal_completed: boolean
  pending_reply: PendingReply | null
  next_tasks?: Task[]
  outputs?: Record<string, Record<string, unknown>>
}
export type { Step, Task, TaskHistoryEntry, PendingReply, ConversationTurn, Session }
