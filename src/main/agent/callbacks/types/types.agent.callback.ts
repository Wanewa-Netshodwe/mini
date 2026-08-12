import { Session } from '../../harness/types/types.Session'

export interface AgentProgressEvent {
  type: 'step_start' | 'step_end' | 'task_end' | 'log'
  icon?: string
  message: string
  verdict?: 'pass' | 'fail'
  handler?: string
  failure_reason?: string | null
  task_status?: string
  outputs?: Record<string, unknown>
}
export type AgentProgressCallback = (event: AgentProgressEvent) => void

export interface RunAgentResult {
  text: string
  sessionId: string
  session: Session
}
