import { runHarness } from '../harness/harness'
import { HarnessCallbacks } from '../harness/types/types.Harness'
import { Session } from '../harness/types/types.Session'
import { resumeWithUserReply } from '../harness/utils/harness.utils'
import { logTaskState } from './utils/runner.utils'

const runner = async (
  initial: Session,
  opts: { autoApprove: boolean; autoReply?: string },
  callbacks?: HarnessCallbacks
): Promise<Session> => {
  let session: Session = JSON.parse(JSON.stringify(initial))
  let guard = 0

  while (guard++ < 100) {
    logTaskState(session, '▶ Running harness')
    const result = await runHarness(session, callbacks)

    if (result.status === 'completed') {
      logTaskState(result, '✔ Completed')
      return result
    }
    if (result.status === 'escalated') {
      logTaskState(result, '✖ Escalated')
      return result
    }
    if (result.status === 'waiting_for_user_reply') {
      logTaskState(result, '⏸ Waiting for user reply')
      if (!result.pending_reply) {
        console.log('[RUN] ⏸ Waiting for user reply (no correlation key) — cannot auto-resume.')
        return result
      }
      if (!opts.autoReply) {
        console.log(
          '[RUN] ⏸ Waiting for user reply — rerun with --auto-reply="<msg>" to simulate an inbound reply.'
        )
        return result
      }
      console.log(`[RUN] ➤ Simulating user reply: ${opts.autoReply}`)
      session = resumeWithUserReply(result, result.pending_reply.correlation_key, {
        message: opts.autoReply
      })
      continue
    }

    return result
  }

  return session
}
export { runner }
