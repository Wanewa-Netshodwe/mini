import { Session } from './types.Session'
interface PauseRequest {
  reason: 'approval_pending' | 'waiting_for_user_reply'
  correlation_key?: string
  timeout_seconds?: number
  approval_request?: Record<string, unknown>
}

interface HandlerResult {
  verdict: 'pass' | 'fail'
  data: Record<string, unknown>
  failure_reason?: string
  pause?: PauseRequest
}

interface CallAction {
  type: 'call'
  handler: string
  payload: Record<string, unknown>
  step_number: number
  task_id: string
  task_goal?: string
}

interface DoneAction {
  type: 'done'
  session: Session
  reason: string
}

interface PauseAction {
  type: 'pause'
  reason: 'approval_pending' | 'waiting_for_user_reply' | 'escalated'
  session: Session
  approval_request?: Record<string, unknown>
  correlation_key?: string
}

type OrchestratorAction = CallAction | DoneAction | PauseAction

export type { PauseRequest, HandlerResult, CallAction, DoneAction, PauseAction, OrchestratorAction }
