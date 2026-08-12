import { HarnessCallbacks } from '../harness/types/types.Harness'
import { AgentProgressCallback } from './types/types.agent.callback'
const HANDLER_ICONS: Record<string, string> = {
  recruitment_platform_sub_agent: '🔍',
  email_api: '📧',
  whatsapp_api: '💬',
  file_system: '📁',
  calendar_api: '📅',
  google_calendar_connection: '🔗',
  google_calendar_query: '📅',
  shell: '💻',
  microsoft_word: '📝',
  reprompter: '🔧'
}
const cbs = (onProgress?: AgentProgressCallback): HarnessCallbacks => ({
  onStepStart: ({ step_goal, handler, task_goal }) => {
    const icon = HANDLER_ICONS[handler] ?? '⚙️'
    const goal = (step_goal || task_goal || 'Working…').replace(/\s+/g, ' ').trim()
    onProgress?.({
      type: 'step_start',
      icon,
      handler,
      message: `${icon} ${goal.length > 90 ? goal.slice(0, 90) + '…' : goal}`
    })
  },
  onStepEnd: ({ verdict, handler, failure_reason }) => {
    onProgress?.({
      type: 'step_end',
      verdict: verdict ?? undefined,
      handler,
      failure_reason,
      message:
        verdict === 'pass'
          ? `✓ done (${handler})`
          : `✗ ${handler}${failure_reason ? ` — ${failure_reason}` : ''}`
    })
  },
  onTaskEnd: ({ task_goal, status, outputs, failure_reason }) => {
    onProgress?.({
      type: 'task_end',
      task_status: status,
      outputs,
      failure_reason,
      message:
        status === 'escalated'
          ? `✋ Task did not complete — ${failure_reason ?? 'escalated'}`
          : `✅ Task complete: ${task_goal}`
    })
  }
})
export { cbs , HANDLER_ICONS }
