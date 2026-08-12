import { cbs } from './callbacks/callbacks'
import { AgentProgressCallback, RunAgentResult } from './callbacks/types/types.agent.callback'
import { Session } from './harness/types/types.Session'
import { resumeWithUserReply } from './harness/utils/harness.utils'
import { ChatMessage, LLM } from './LLM/llm'
import { TaskPlanner } from './prompts/taskPlanner'
import { runner } from './runner/runner'
import { PlannerSession } from './runner/types/type.runner'
import {
  buildToolCatalogText,
  ensureUniqueTaskIds,
  translateSession
} from './runner/utils/runner.utils'
import {
  activeSessions,
  buildFinalSummary,
  classifyIntent,
  conversationalReply,
  createEmptyTask,
  extractJSON,
  planIsPureChat,
  recordTurn,
  saveSessionToFile
} from './utils/agent.utils'
const model = LLM.getInstance()

export async function runAgent(
  prompt: string,
  sessionId?: string,
  onProgress?: AgentProgressCallback
): Promise<RunAgentResult> {
  let existingSession = sessionId ? activeSessions.get(sessionId) : undefined

  const callbacks = cbs(onProgress)
  // 1. If existing session is waiting for user reply
  if (
    existingSession &&
    existingSession.status === 'waiting_for_user_reply' &&
    existingSession.pending_reply
  ) {
    onProgress?.({ type: 'log', message: 'Resuming session with user reply…' })
    const correlationKey = existingSession.pending_reply.correlation_key
    const sessionToRun = resumeWithUserReply(existingSession, correlationKey, { message: prompt })
    const finalSession = await runner(sessionToRun, { autoApprove: false }, callbacks)
    const text = await buildFinalSummary(finalSession, prompt, model)
    recordTurn(finalSession, prompt, text)
    activeSessions.set(finalSession.session_id, finalSession)
    void saveSessionToFile(finalSession)
    return { text, sessionId: finalSession.session_id, session: finalSession }
  }

  // Step 1 — classify
  const intent = await classifyIntent(prompt, model)
  if (intent === 'chat') {
    onProgress?.({ type: 'log', message: 'Replying conversationally.' })
    const text = await conversationalReply(prompt, model, existingSession)
    let sessionToKeep: Session
    if (!existingSession) {
      const newId = `S-${Date.now()}`
      sessionToKeep = {
        session_id: newId,
        title: prompt.slice(0, 30),
        main_goal: prompt,
        status: 'completed',
        current_task: createEmptyTask('Conversational Chat'),
        task_history: [],
        is_followup: false,
        conversation_log: [],
        main_goal_completed: true,
        pending_reply: null,
        outputs: {}
      }
    } else {
      sessionToKeep = existingSession
    }
    recordTurn(sessionToKeep, prompt, text)
    activeSessions.set(sessionToKeep.session_id, sessionToKeep)
    void saveSessionToFile(sessionToKeep)

    console.log('\n============================== SESSION OBJECT ==============================')
    console.log(`Session ID : ${sessionToKeep.session_id}`)
    console.log(`Status     : ${sessionToKeep.status}`)
    console.log(`Is Followup: ${sessionToKeep.is_followup}`)
    console.log(`Turns      : ${sessionToKeep.conversation_log?.length ?? 0}`)
    console.log('FULL SESSION STATE:')
    console.log(JSON.stringify(sessionToKeep, null, 2))
    console.log('============================================================================\n')

    return { text, sessionId: sessionToKeep.session_id, session: sessionToKeep }
  }

  onProgress?.({ type: 'log', message: 'Task detected — building a plan…' })

  const catalogText = await buildToolCatalogText()
  const planner = new TaskPlanner()

  const historyContext =
    existingSession &&
    ((existingSession.conversation_log && existingSession.conversation_log.length > 0) ||
      (existingSession.task_history && existingSession.task_history.length > 0) ||
      Object.keys(existingSession.outputs || {}).length > 0)
      ? [
          '## PREVIOUS SESSION CONTEXT & DIALOGUE LOG (authoritative memory)',
          `session_id: ${existingSession.session_id}`,
          `is_followup: true`,
          `conversation_log: ${JSON.stringify(existingSession.conversation_log || [], null, 2)}`,
          `task_history: ${JSON.stringify(existingSession.task_history || [], null, 2)}`,
          `accumulated_outputs: ${JSON.stringify(existingSession.outputs || {}, null, 2)}`,
          ''
        ].join('\n')
      : ''

  const userContent = [
    `user_prompt: ${prompt}`,
    `current_datetime: ${new Date().toISOString()}`,
    historyContext,
    '## TOOLS AVAILABLE (authoritative — use only exact names from this catalog)',
    catalogText
  ]
    .filter(Boolean)
    .join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: planner.systemInstruction },
    { role: 'user', content: userContent }
  ]

  onProgress?.({ type: 'log', message: 'Calling planner…' })
  const res = await model.prompt(messages)

  const parsed = extractJSON(res.text)
  if (!parsed) {
    const errorText = '⚠️ Could not parse the agent plan. Please try again.'
    const fallbackId = existingSession?.session_id || `S-${Date.now()}`
    const fallbackSession: Session = existingSession || {
      session_id: fallbackId,
      title: 'Failed plan',
      main_goal: prompt,
      status: 'escalated',
      current_task: createEmptyTask('Failed task'),
      task_history: [],
      is_followup: false,
      conversation_log: [],
      main_goal_completed: false,
      pending_reply: null,
      outputs: {}
    }
    recordTurn(fallbackSession, prompt, errorText)
    activeSessions.set(fallbackId, fallbackSession)
    void saveSessionToFile(fallbackSession)
    return { text: errorText, sessionId: fallbackId, session: fallbackSession }
  }

  const plan = parsed as PlannerSession
  const uniquePlan = ensureUniqueTaskIds(plan)

  if (planIsPureChat(uniquePlan)) {
    const text = await conversationalReply(prompt, model, existingSession)
    const activeId = existingSession?.session_id || `S-${Date.now()}`
    const activeSession: Session = existingSession || {
      session_id: activeId,
      title: 'Chat Session',
      main_goal: prompt,
      status: 'completed',
      current_task: createEmptyTask('Chat Session'),
      task_history: [],
      is_followup: false,
      conversation_log: [],
      main_goal_completed: true,
      pending_reply: null,
      outputs: {}
    }
    recordTurn(activeSession, prompt, text)
    activeSessions.set(activeId, activeSession)
    void saveSessionToFile(activeSession)
    return { text, sessionId: activeId, session: activeSession }
  }

  const session = translateSession(uniquePlan, existingSession)
  activeSessions.set(session.session_id, session)

  const final = await runner(session, { autoApprove: true }, callbacks)
  const summary = await buildFinalSummary(final, prompt, model)
  recordTurn(final, prompt, summary)
  activeSessions.set(final.session_id, final)
  void saveSessionToFile(final)

  console.log('\n============================== SESSION OBJECT ==============================')
  console.log(`Session ID : ${final.session_id}`)
  console.log(`Status     : ${final.status}`)
  console.log(`Title      : ${final.title}`)
  console.log(`Is Followup: ${final.is_followup}`)
  console.log(`Turns      : ${final.conversation_log?.length ?? 0}`)
  console.log(`History    : ${final.task_history?.length ?? 0} task(s)`)
  console.log('FULL SESSION STATE:')
  console.log(JSON.stringify(final, null, 2))
  console.log('============================================================================\n')

  return { text: summary, sessionId: final.session_id, session: final }
}
