import { ReprompterInput, ReprompterOutput } from '../../types/type.reprompter'
import { ChatMessage, LLM } from '../llm'
import { Reprompter } from '../../prompts/reprompter'

export async function runReprompter(payload: ReprompterInput): Promise<ReprompterOutput> {
  const prevAttempt = (payload.previous_attempt ?? {}) as Record<string, unknown>
  const failureReason = String(payload.failure_reason ?? '')
  const taskId = payload.task_id ?? 'task'
  const stepNumber = payload.step_number ?? 1
  const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  try {
    const model = LLM.getInstance(false)
    const promptText = `## TASK STEP FAILURE REPORT
Step Goal: "${payload.step_goal ?? ''}"
Failure Reason: "${failureReason}"
System Local Time Zone: "${systemTz}"
System Current DateTime: "${new Date().toISOString()}"

## PREVIOUS STEP PARAMETERS (JSON):
${JSON.stringify(prevAttempt, null, 2)}

## SESSION CONTEXT:
${JSON.stringify(payload.context ?? {}, null, 2)}`

    const systemPrompter = new Reprompter()
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompter.systemInstruction },
      { role: 'user', content: promptText }
    ]

    const llmRes = await model.prompt(messages)
    const match = llmRes.text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as {
        can_auto_repair?: boolean
        repaired_data?: Record<string, unknown>
        clarification_question?: string
      }

      if (parsed?.can_auto_repair && parsed.repaired_data) {
        console.log(`[REPROMPTER] Auto-repaired parameters for step ${stepNumber}`)
        const cleanData = { ...parsed.repaired_data }
        delete cleanData.user_reply
        return {
          verdict: 'pass',
          data: cleanData
        }
      }

      if (parsed?.clarification_question) {
        console.log(`[REPROMPTER] Asking user for clarification on step ${stepNumber}`)
        return {
          verdict: 'fail',
          failure_reason: parsed.clarification_question,
          data: {},
          pause: {
            reason: 'waiting_for_user_reply',
            correlation_key: `reply-${taskId}-${stepNumber}`
          }
        }
      }
    }
  } catch (err) {
    console.warn('[REPROMPTER] LLM reprompter reasoning failed:', err)
  }

  const question = `I ran into an issue while processing your request (${failureReason}). Could you please provide additional details so I can complete this for you?`
  return {
    verdict: 'fail',
    failure_reason: question,
    data: {},
    pause: {
      reason: 'waiting_for_user_reply',
      correlation_key: `reply-${taskId}-${stepNumber}`
    }
  }
}
