import { HarnessCallbacks } from './types/types.Harness'
import { HandlerResult, OrchestratorAction } from './types/types.Orchestration'
import { Session, Task } from './types/types.Session'
import { collectTaskOutputs, escalate, resolveStepPlaceholders } from './utils/orchestrator.utils'
import { buildPayload } from './utils/payload.utils'

function* orchestrator(
  initialSession: Session,
  callbacks?: HarnessCallbacks
): Generator<OrchestratorAction, void, HandlerResult> {
  let session: Session = JSON.parse(JSON.stringify(initialSession))

  while (true) {
    const task = session.current_task

    // check if its in a terminal state before doing anything else
    if (session.status === 'completed' || session.status === 'escalated') {
      yield { type: 'done', session, reason: 'terminal_state_reached' }
      return
    }

    // initialize task if it is pending
    if (task.status === 'pending') {
      task.status = 'in_progress'
      const firstStep = task.steps[0]
      if (firstStep) {
        firstStep.status = 'in_progress'
        task.current_step = 0
      }
    }

    //find the active step based on the current_step index
    const stepIndex = task.current_step
    const step = task.steps[stepIndex]

    if (!step) {
      // All steps exhausted — mark current task complete, then promote the next task if queued.
      task.status = 'completed'
      const completedOutputs = collectTaskOutputs(task)
      session.task_history.push({
        task_id: task.task_id,
        goal: task.goal,
        status: 'completed',
        completed_at: new Date().toISOString(),
        outputs: completedOutputs
      })
      callbacks?.onTaskEnd?.({
        task_id: task.task_id,
        task_goal: task.goal,
        status: 'completed',
        outputs: completedOutputs,
        failure_reason: null
      })

      const nextTasks = session.next_tasks ?? []
      if (nextTasks.length > 0) {
        const promoted = nextTasks.shift() as Task
        session.next_tasks = nextTasks
        // Resolve any {{task_id.output.field}} placeholders in the promoted task's
        // steps against the outputs of tasks completed so far.
        resolveStepPlaceholders(promoted, session)
        session.current_task = promoted
        promoted.status = 'in_progress'
        const firstStep = promoted.steps[0]
        if (firstStep) {
          firstStep.status = 'in_progress'
          promoted.current_step = 0
        }
        // continue to the next iteration of the loop to handle the newly promoted task
        continue
      }

      session.status = 'completed'
      session.main_goal_completed = true
      session.pending_reply = null
      yield { type: 'done', session, reason: 'all_steps_completed' }
      return
    }

    if (step.status === 'pending') {
      step.status = 'in_progress'
    }

    if (step.status === 'in_progress') {
      // --- RULE 7: UNRESOLVED REQUIRED DATA (blocking, not advisory) --- from the planner prompt
      if (
        step.handler === 'email_api' &&
        step.data_received &&
        (step.data_received.subject === null ||
          step.data_received.subject === undefined ||
          (typeof step.data_received.subject === 'string' &&
            step.data_received.subject.trim() === '')) &&
        typeof step.data_received.body === 'string' &&
        step.data_received.body.trim() !== ''
      ) {
        const bodyText = step.data_received.body
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        step.data_received.subject = bodyText.slice(0, 70) + (bodyText.length > 70 ? '…' : '')
      }
      const supplied = buildPayload(session, step)

      //if a user supplied a reply, we need to absorb it into the step's data_received before checking for missing fields
      if (step.data_received && step.data_received.user_reply) {
        const replyAbsorbPayload = {
          task_id: task.task_id,
          step_number: step.step_number,
          step_goal: step.goal,
          previous_attempt: step.data_received,
          failure_reason:
            step.failure_reason ??
            `Missing required information: ${(step.data_needed ?? []).join(', ')}`,
          context: supplied.context as Record<string, unknown> | undefined
        }
        const absorbResult: HandlerResult = yield {
          type: 'call',
          handler: 'reprompter',
          payload: replyAbsorbPayload,
          step_number: step.step_number,
          task_id: task.task_id,
          task_goal: task.goal
        }
        if (absorbResult.verdict === 'pass' && absorbResult.data) {
          const repaired = { ...absorbResult.data }
          delete repaired.user_reply
          step.data_received = repaired
          step.failure_reason = null
        } else {
          const stripped = { ...step.data_received }
          delete stripped.user_reply
          step.data_received = stripped
        }
      }

      const missing = (step.data_needed ?? []).filter((field) => {
        const v = buildPayload(session, step)[field]
        return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
      })
      if (missing.length > 0) {
        // Don't escalate immediately — fail the step so the retry/reprompter cycle can ask the user
        const missingReason = `Missing required information to ${step.goal}: ${missing.join(', ')}. Please provide the missing details.`
        step.status = 'failed'
        step.verdict = 'fail'
        step.failure_reason = missingReason
        task.failure_count++

        if (task.failure_count >= task.max_retries) {
          escalate(session, task, missingReason, callbacks?.onTaskEnd)
          yield { type: 'pause', reason: 'escalated', session }
          return
        }

        // Route to reprompter to ask the user
        const reprompterPayload = {
          task_id: task.task_id,
          step_number: step.step_number,
          step_goal: step.goal,
          previous_attempt: step.data_received,
          failure_reason: missingReason,
          context: buildPayload(session, step).context
        }

        const reprompterResult: HandlerResult = yield {
          type: 'call',
          handler: 'reprompter',
          payload: reprompterPayload,
          step_number: step.step_number,
          task_id: task.task_id,
          task_goal: task.goal
        }

        if (reprompterResult.pause) {
          if (reprompterResult.pause.reason === 'waiting_for_user_reply') {
            session.status = 'waiting_for_user_reply'
            session.pending_reply = {
              task_id: task.task_id,
              step_number: step.step_number,
              correlation_key:
                reprompterResult.pause.correlation_key ??
                `reply-${task.task_id}-${step.step_number}`,
              deadline: reprompterResult.pause.timeout_seconds
                ? new Date(Date.now() + reprompterResult.pause.timeout_seconds * 1000).toISOString()
                : null
            }
            if (reprompterResult.failure_reason) {
              step.failure_reason = reprompterResult.failure_reason
            }
          } else {
            session.status = 'paused'
          }
          yield {
            type: 'pause',
            reason: reprompterResult.pause.reason,
            session,
            ...(reprompterResult.pause.correlation_key
              ? { correlation_key: reprompterResult.pause.correlation_key }
              : {})
          }
          return
        }

        if (reprompterResult.verdict === 'pass') {
          // Reprompter resolved the missing fields — patch them into data_received and retry
          step.data_received = { ...step.data_received, ...reprompterResult.data }
          step.status = 'in_progress'
          step.verdict = null
          step.failure_reason = null
        } else {
          step.status = 'in_progress'
        }
        continue
      }

      // Yield to caller: execute this handler
      const result: HandlerResult = yield {
        type: 'call',
        handler: step.handler,
        payload: buildPayload(session, step),
        step_number: step.step_number,
        task_id: task.task_id,
        task_goal: task.goal
      }

      // --- PAUSE REQUEST (checked before pass/fail routing) ---
      // A handler can ask to pause regardless of verdict. This is what fixes
      // approval_gate: "not yet decided" is neither a pass nor a retryable
      // failure — it's a real pause waiting on something external.
      if (result.pause) {
        step.data_received = result.data || {}
        step.status = 'paused'
        step.verdict = null
        step.failure_reason = null

        if (result.pause.reason === 'waiting_for_user_reply') {
          if (!result.pause.correlation_key) {
            escalate(
              session,
              task,
              `Handler ${step.handler} requested waiting_for_user_reply without a correlation_key.`,
              callbacks?.onTaskEnd
            )
            yield { type: 'pause', reason: 'escalated', session }
            return
          }
          session.status = 'waiting_for_user_reply'
          session.pending_reply = {
            task_id: task.task_id,
            step_number: step.step_number,
            correlation_key: result.pause.correlation_key,
            deadline: result.pause.timeout_seconds
              ? new Date(Date.now() + result.pause.timeout_seconds * 1000).toISOString()
              : null
          }
        } else {
          // approval_pending
          session.status = 'paused'
        }

        yield {
          type: 'pause',
          reason: result.pause.reason,
          session,
          ...(result.pause.approval_request
            ? { approval_request: result.pause.approval_request }
            : {}),
          ...(result.pause.correlation_key ? { correlation_key: result.pause.correlation_key } : {})
        }
        return
      }

      // Merge result back into step. On a PASS the handler's output replaces the
      // step's args (it becomes the task's output). On a FAILURE we KEEP the
      // original args so the retry/reprompter cycle re-runs with them intact —
      // overwriting them with an empty failure payload is what used to make the
      // retry lose filePath/operation/content.
      step.verdict = result.verdict

      if (result.verdict === 'pass') {
        step.data_received = result.data || {}
        step.status = 'completed'
        task.current_step++
      } else {
        step.status = 'failed'
        step.failure_reason = result.failure_reason || 'unknown_failure'
        task.failure_count++

        if (task.failure_count >= task.max_retries) {
          escalate(session, task, step.failure_reason, callbacks?.onTaskEnd)
          yield { type: 'pause', reason: 'escalated', session }
          return
        }

        // Retry: route to reprompter
        const reprompterPayload = {
          task_id: task.task_id,
          step_number: step.step_number,
          step_goal: step.goal,
          previous_attempt: step.data_received,
          failure_reason: step.failure_reason,
          context: buildPayload(session, step).context
        }

        const reprompterResult: HandlerResult = yield {
          type: 'call',
          handler: 'reprompter',
          payload: reprompterPayload,
          step_number: step.step_number,
          task_id: task.task_id,
          task_goal: task.goal
        }

        if (reprompterResult.pause) {
          if (reprompterResult.pause.reason === 'waiting_for_user_reply') {
            session.status = 'waiting_for_user_reply'
            session.pending_reply = {
              task_id: task.task_id,
              step_number: step.step_number,
              correlation_key:
                reprompterResult.pause.correlation_key ??
                `reply-${task.task_id}-${step.step_number}`,
              deadline: reprompterResult.pause.timeout_seconds
                ? new Date(Date.now() + reprompterResult.pause.timeout_seconds * 1000).toISOString()
                : null
            }
            if (reprompterResult.failure_reason) {
              step.failure_reason = reprompterResult.failure_reason
            }
          } else if (reprompterResult.pause.reason === 'approval_pending') {
            session.status = 'paused'
          }

          yield {
            type: 'pause',
            reason: reprompterResult.pause.reason,
            session,
            ...(reprompterResult.pause.approval_request
              ? { approval_request: reprompterResult.pause.approval_request }
              : {}),
            ...(reprompterResult.pause.correlation_key
              ? { correlation_key: reprompterResult.pause.correlation_key }
              : {})
          }
          return
        }

        if (reprompterResult.verdict === 'pass') {
          // Reprompter fixed the arguments — update step.data_received and keep in_progress to re-run handler
          step.data_received = reprompterResult.data
          step.status = 'in_progress'
          step.verdict = null
          step.failure_reason = null
        } else {
          // Reprompter also failed — stay on this step for another retry cycle
          step.status = 'in_progress'
        }
      }
    }
  }
}
export { orchestrator }
