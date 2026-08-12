import { orchestrator } from './orchestrator'
import { HarnessCallbacks } from './types/types.Harness'
import { Session } from './types/types.Session'
import { handlerRegistry, summarizeArgs } from './utils/harness.utils'

async function runHarness(session: Session, callbacks?: HarnessCallbacks): Promise<Session> {
  const gen = orchestrator(session, callbacks)
  let result = gen.next()

  while (!result.done) {
    const action = result.value

    if (action.type === 'done') {
      return action.session
    }

    if (action.type === 'pause') {
      if (action.reason === 'escalated') {
        console.error('[HARNESS] Task escalated:', action.session.current_task.task_id)
      } else if (action.reason === 'waiting_for_user_reply') {
        console.log(
          '[HARNESS] Parked, waiting on user reply:',
          action.correlation_key,
          'session:',
          action.session.session_id
        )
      } else {
        console.log('[HARNESS] Paused for approval:', action.session.session_id)
      }
      // In all pause cases, persist `action.session` to your store and stop.
      // Resumption happens later via a fresh orchestrator(session) call,
      // seeded by resumeWithUserReply / resumeWithTimeout / resumeAfterApprovalDecision.
      return action.session
    }

    if (action.type === 'call') {
      const handler = handlerRegistry[action.handler]
      if (!handler) {
        throw new Error(`Unknown handler: ${action.handler}`)
      }

      const stepGoal = action.payload.step_goal as string | undefined
      if (stepGoal) {
        console.log(`[HARNESS] Step ${action.step_number} goal: ${stepGoal}`)
      }
      const argsSummary = summarizeArgs(action.payload)
      console.log(
        `[HARNESS] Step ${action.step_number} → ${action.handler} | task ${action.task_id} | args: ${argsSummary}`
      )

      callbacks?.onStepStart?.({
        session_id: session.session_id,
        task_id: action.task_id,
        task_goal: action.task_goal ?? '',
        step_number: action.step_number,
        step_goal: stepGoal ?? '',
        handler: action.handler
      })

      try {
        const startedAt = Date.now()
        const handlerResult = await handler(action.payload)
        const elapsed = Date.now() - startedAt
        console.log(
          `[HARNESS]   ├─ ${action.handler} returned: verdict=${handlerResult.verdict}${handlerResult.pause ? ` pause=${handlerResult.pause.reason}` : ''} (${elapsed}ms)`
        )
        if (handlerResult.failure_reason) {
          console.log(`[HARNESS]   │   failure_reason: ${handlerResult.failure_reason}`)
        }
        if (handlerResult.data && Object.keys(handlerResult.data).length > 0) {
          console.log(`[HARNESS]   │   data: ${summarizeArgs(handlerResult.data)}`)
        }
        callbacks?.onStepEnd?.({
          task_id: action.task_id,
          step_number: action.step_number,
          handler: action.handler,
          verdict: handlerResult.verdict,
          failure_reason: handlerResult.failure_reason ?? null
        })
        result = gen.next(handlerResult)
      } catch (err) {
        console.error(`[HARNESS]   └─ ${action.handler} THREW: ${(err as Error).message}`)
        callbacks?.onStepEnd?.({
          task_id: action.task_id,
          step_number: action.step_number,
          handler: action.handler,
          verdict: 'fail',
          failure_reason: (err as Error).message
        })
        result = gen.next({
          verdict: 'fail',

          data: {},
          failure_reason: `Handler ${action.handler} threw: ${(err as Error).message}`
        })
      }
    }
  }

  return session
}

export { runHarness }
