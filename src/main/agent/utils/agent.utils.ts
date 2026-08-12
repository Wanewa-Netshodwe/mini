import { join } from 'path'
import { Session, Task } from '../harness/types/types.Session'
import fs from 'fs/promises'
import { ChatMessage, LLM } from '../LLM/llm'
import { PlannerSession, PlannerTask } from '../runner/types/type.runner'
import { HarnessCallbacks } from '../harness/types/types.Harness'
import { HANDLER_ICONS } from '../callbacks/callbacks'

const activeSessions = new Map<string, Session>()
const SESSIONS_DIR = join(process.cwd(), 'sessions')
const saveSessionToFile = async (session: Session): Promise<void> => {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true })
    const safeId = session.session_id.replace(/[^a-zA-Z0-9_-]/g, '_')
    const filePath = join(SESSIONS_DIR, `${safeId}.json`)
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8')
    console.log(`[SESSION] Saved → ${filePath}`)
  } catch (err) {
    console.error('[SESSION] Failed to save session file:', (err as Error).message)
  }
}

const loadSessionsFromDisk = async (): Promise<void> => {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true })
    const files = await fs.readdir(SESSIONS_DIR)
    const jsonFiles = files.filter((f) => f.endsWith('.json'))
    let loaded = 0
    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(join(SESSIONS_DIR, file), 'utf-8')
        const session = JSON.parse(raw) as Session
        if (session?.session_id) {
          activeSessions.set(session.session_id, session)
          loaded++
        }
      } catch (parseErr) {
        console.error(`[SESSION] Could not parse ${file}:`, (parseErr as Error).message)
      }
    }
    console.log(`[SESSION] Loaded ${loaded} session(s) from disk (${SESSIONS_DIR})`)
  } catch (err) {
    console.error('[SESSION] Failed to load sessions from disk:', (err as Error).message)
  }
}

const initSessions = async (): Promise<void> => {
  await loadSessionsFromDisk()
}

const createEmptyTask = (goal: string = 'Session Task'): Task => {
  return {
    task_id: `T-${Date.now()}`,
    goal,
    status: 'pending',
    failure_count: 0,
    max_retries: 3,
    steps: [],
    current_step: 0
  }
}

const createNewSession = (): string => {
  const newId = `S-${Date.now()}`
  const emptySession: Session = {
    session_id: newId,
    title: 'New Session',
    main_goal: '',
    status: 'active',
    current_task: createEmptyTask('New session initialized'),
    next_tasks: [],
    task_history: [],
    outputs: {},
    is_followup: false,
    conversation_log: [],
    main_goal_completed: false,
    pending_reply: null
  }
  activeSessions.set(newId, emptySession)
  return newId
}

const getAllSessions = (): Array<{ session_id: string; title?: string; status: string }> => {
  return Array.from(activeSessions.values()).map((s) => ({
    session_id: s.session_id,
    title: s.title || `Session ${s.session_id.slice(-6)}`,
    status: s.status
  }))
}

const getSession = (sessionId: string): Session | undefined => {
  if (activeSessions.has(sessionId)) return activeSessions.get(sessionId)
  try {
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const raw = require('fs').readFileSync(join(SESSIONS_DIR, `${safeId}.json`), 'utf-8')
    const session = JSON.parse(raw) as Session
    if (session?.session_id) {
      activeSessions.set(session.session_id, session)
      return session
    }
  } catch {
    // File doesn't exist or is unreadable — that's fine
  }
  return undefined
}

const recordTurn = (session: Session, userPrompt: string, aiResponse: string): void => {
  if (!session.conversation_log) {
    session.conversation_log = []
  }
  const turnIndex = session.conversation_log.length + 1
  session.conversation_log.push({
    turn: turnIndex,
    user_prompt: userPrompt,
    ai_response: aiResponse,
    timestamp: new Date().toISOString()
  })
  session.is_followup =
    session.conversation_log.length > 1 || (session.task_history && session.task_history.length > 0)
}
const conversationalReply = async (
  prompt: string,
  model: LLM,
  session?: Session
): Promise<string> => {
  try {
    const systemContent =
      'You are a friendly recruitment assistant who chats like a normal chatbot. ' +
      "The user's message needs no tools and no action — it might be a greeting, a general-knowledge question " +
      '(facts, comparisons, opinions, advice), or small talk. Respond naturally and helpfully: answer the question ' +
      "if there is one, acknowledge greetings, and keep it conversational. Be accurate and say when you're unsure. " +
      'Do NOT mention plans, tasks, or tools, and do NOT invent that you did anything. ' +
      (session && session.task_history && session.task_history.length > 0
        ? `\n\n## PREVIOUS SESSION TASKS (for reference only)\nTask History: ${JSON.stringify(session.task_history, null, 2)}\nOutputs: ${JSON.stringify(session.outputs || {}, null, 2)}`
        : '')

    const messages: ChatMessage[] = [{ role: 'system', content: systemContent }]

    if (session && session.conversation_log && session.conversation_log.length > 0) {
      for (const turn of session.conversation_log) {
        messages.push({ role: 'user', content: turn.user_prompt })
        messages.push({ role: 'assistant', content: turn.ai_response })
      }
    }

    // Add the current user prompt as the latest message
    messages.push({ role: 'user', content: prompt })

    console.log(
      `[conversationalReply] Building message with ${messages.length} messages (${session?.conversation_log?.length ?? 0} prior turns)`
    )
    const res = await model.prompt(messages)
    if (res.text) return res.text
    throw new Error('empty reply')
  } catch (err) {
    console.error(`[RUN] Chat reply generation failed: ${(err as Error).message}`)
    return "Hey! 👋 I'm here to help — want me to find candidates, send an email or WhatsApp message, or schedule an interview?"
  }
}

const classifyIntent = async (prompt: string, model: LLM): Promise<'task' | 'chat' | undefined> => {
  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You classify a user message to a recruitment assistant. Reply with EXACTLY one word only: TASK or CHAT. ' +
          'TASK means any actual request for the assistant to DO something or retrieve data — find/list/search ' +
          'candidates, send email or WhatsApp, schedule interviews, write or attach files, query the calendar, ' +
          'update records, or any other action. ' +
          'CHAT means anything else — a greeting, a general-knowledge question (e.g. "does pizza contain more ' +
          'calories than a burger?", "what is the capital of France?"), small talk, or an unclear one-liner with ' +
          'no action requested. ' +
          'When in doubt, reply TASK.'
      },
      { role: 'user', content: prompt }
    ]
    const res = await model.prompt(messages)
    const word = res.text.trim().toUpperCase()
    if (word.includes('TASK')) return 'task'
    if (word.includes('CHAT')) return 'chat'
    return undefined
  } catch (err) {
    throw new Error(`Intent classification failed: ${(err as Error).message}`)
  }
}

const planIsPureChat = (plan: PlannerSession): boolean => {
  const countSteps = (t?: PlannerTask): number => (t?.steps ?? []).length
  if (countSteps(plan.current_task) > 0) return false
  return (plan.next_tasks ?? []).every((t) => countSteps(t) === 0)
}
// Render a task's outputs as short sentences or bullet points
const formatTaskResult = (goal: string, outputs?: Record<string, unknown>): string => {
  const out = outputs ?? {}
  const parts: string[] = []

  const pushRecord = (record: Record<string, unknown>, indent: string) => {
    const entries = Object.entries(record)
    if (entries.length === 0) return
    const name = record.name ?? record.title ?? record.full_name ?? record.id ?? null
    if (typeof name === 'string') {
      parts.push(`${indent}• ${name}`)
      const extra = entries.filter(([k]) => !/^(name|title|full_name|id)$/i.test(k))
      for (const [k, v] of extra) {
        const rendered = renderValue(v, false)
        if (rendered) parts.push(`${indent}  ${k}: ${rendered}`)
      }
    } else {
      parts.push(
        `${indent}• ${entries.map(([k, v]) => `${k}: ${renderValue(v, true)}`).join(' | ')}`
      )
    }
  }

  const renderValue = (v: unknown, short: boolean): string => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') {
      const s = v.trim()
      if (!s) return ''
      return short && s.length > 60 ? s.slice(0, 57) + '…' : s
    }
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v)) {
      if (v.every((i) => typeof i === 'string')) return v.join(', ')
      return `[${v.length} item${v.length === 1 ? '' : 's'}]`
    }
    if (typeof v === 'object') {
      const rec = v as Record<string, unknown>
      const nm = rec.name ?? rec.title ?? rec.full_name ?? null
      if (nm) {
        return typeof nm === 'string' ? nm : String(nm)
      }
      return JSON.stringify(rec)
    }
    return String(v)
  }

  const results = out.results
  if (Array.isArray(results)) {
    if (typeof out.count === 'number')
      parts.push(`${out.count} result${out.count === 1 ? '' : 's'}:`)
    else parts.push(`${results.length} result${results.length === 1 ? '' : 's'}:`)
    for (const r of results) {
      if (typeof r === 'string') {
        parts.push(`• ${r}`)
      } else if (r && typeof r === 'object') {
        pushRecord(r as Record<string, unknown>, '  ')
      }
    }
  }

  const names = out.names ?? out.candidate_names ?? out.titles ?? out.ids
  if (!Array.isArray(results) && Array.isArray(names)) {
    parts.push(`${names.length} item${names.length === 1 ? '' : 's'}:`)
    for (const n of names) parts.push(`• ${n}`)
  }

  if (!Array.isArray(results) && !Array.isArray(names)) {
    const skipped = new Set(['results', 'names', 'candidate_names', 'titles', 'ids', 'count'])
    for (const [k, v] of Object.entries(out)) {
      if (skipped.has(k)) continue
      const rendered = renderValue(v, true)
      if (rendered) parts.push(`${k}: ${rendered}`)
    }
  }

  if (parts.length === 0) return goal.replace(/\s+/g, ' ').trim()
  const header = parts.length > 1 ? `${goal.replace(/\s+/g, ' ').trim()} — ` : ''
  return header + parts.join('\n')
}

// Build a final summary of the session  from json to text
const buildFinalSummary = async (
  session: Session,
  originalPrompt: string,
  model: LLM
): Promise<string> => {
  if (session.status === 'waiting_for_user_reply') {
    return printFriendlySummary(session)
  }
  const completed = session.task_history.filter((t) => t.status === 'completed')
  const escalated = session.task_history.filter((t) => t.status === 'escalated')

  if (completed.length === 0 && escalated.length === 0) {
    return printFriendlySummary(session)
  }

  try {
    const taskBlocks = session.task_history
      .map((t) => {
        const lines: string[] = [`TASK: ${t.goal} (${t.status})`]
        if (t.outputs) {
          lines.push('OUTPUTS (JSON):')
          lines.push(JSON.stringify(t.outputs, null, 2))
        }
        return lines.join('\n')
      })
      .join('\n\n')

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a recruitment assistant writing a final, human-readable reply for the end user. ' +
          'Below is the original request and the machine output of every task that ran. ' +
          "Write a concise, friendly final message in the user's tone: state what was done, " +
          'then give the actual results (names, counts, IDs, confirmations) in a clear list. ' +
          'Do NOT include JSON. Do NOT invent data. If nothing succeeded, say so plainly.'
      },
      {
        role: 'user',
        content: `ORIGINAL REQUEST: ${originalPrompt}\n\nTASK RESULTS:\n${taskBlocks}`
      }
    ]
    const res = await model.prompt(messages)
    if (res.text) return res.text.trim()
    throw new Error('empty reply')
  } catch {
    const lines: string[] = []
    for (const t of session.task_history) {
      if (t.status === 'completed') {
        lines.push(formatTaskResult(t.goal, t.outputs))
      } else if (t.status === 'escalated') {
        lines.push(`✋ ${t.goal} — did not complete`)
      }
    }
    return lines.join('\n')
  }
}
const printFriendlySummary = (session: Session): string => {
  const t = session.current_task
  const lastStep = t?.steps?.[t.steps.length - 1]
  if (session.status === 'escalated') {
    return `😔 That didn't quite work out — ${lastStep?.failure_reason ?? 'something went wrong'}.`
  }
  if (session.status === 'paused') {
    return `⏸ Paused — waiting on you to approve or reply.`
  }
  if (session.status === 'waiting_for_user_reply') {
    const question =
      lastStep?.failure_reason ?? 'I need a few more details to complete your request.'
    return `❓ ${question}`
  }
  if (session.main_goal_completed || session.status === 'completed') {
    return `🎉 All done! ${session.title ? `"${session.title}"` : ''} completed successfully.`
  }
  return `✅ Finished with status: ${session.status}.`
}
const parseBalanced = (slice: string): unknown | null => {
  const open = slice[0]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(slice.slice(0, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}
const extractJSON = (text: string): unknown | null => {
  const candidates: string[] = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].flatMap((m) =>
    m[1] ? [m[1]] : []
  )
  candidates.push(text)

  for (const candidate of candidates) {
    const start = candidate.search(/[\[{]/)
    if (start === -1) continue
    const slice = candidate.slice(start)
    try {
      return JSON.parse(slice)
    } catch {
      // try trimming trailing junk by locating balanced close
      const parsed = parseBalanced(slice)
      if (parsed) return parsed
    }
  }
  return null
}
export {
  extractJSON,
  parseBalanced,
  activeSessions,
  initSessions,
  createNewSession,
  getAllSessions,
  getSession,
  recordTurn,
  saveSessionToFile,
  createEmptyTask,
  conversationalReply,
  classifyIntent,
  planIsPureChat,
  buildFinalSummary,
  printFriendlySummary
}
