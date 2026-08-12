import { Session, Step, Task } from '../../harness/types/types.Session.js'
import { PlannerSession, PlannerStep, PlannerTask } from '../types/type.runner.js'

const buildToolCatalogText = async (): Promise<string> => {
  const {
    whatsappSubAgentDes,
    emailSubAgentDesc,
    calendarToolDesc,
    fileSystemToolDesc,
    microsoftWordDesc,
    googleCalendarQueryDesc,
    recruitmentPlatformSubAgentDesc,
    shellDesc
  } = await import('../../toolDescriptions/index.description.js')

  const toolsDesc = [
    whatsappSubAgentDes,
    emailSubAgentDesc,
    calendarToolDesc,
    fileSystemToolDesc,
    microsoftWordDesc,
    googleCalendarQueryDesc,
    recruitmentPlatformSubAgentDesc,
    shellDesc
  ]
  return toolsDesc.map((t) => JSON.stringify(t.toJSON(), null, 2)).join('\n\n')
}
const TOOL_TO_HANDLER: Record<string, string> = {
  calendar: 'calendar_api',
  google_calendar_connection: 'google_calendar_connection',
  google_calendar_query: 'google_calendar_query',
  file_system: 'file_system',
  microsoft_word: 'microsoft_word',
  email_sub_agent: 'email_api',
  whatsapp_sub_agent: 'whatsapp_api',
  recruitment_platform_sub_agent: 'recruitment_platform_sub_agent',
  approval_gate: 'approval_gate'
}
const translateStep = (ps: PlannerStep): Step => {
  return {
    step_number: ps.step_number ?? 1,
    goal: ps.goal ?? '',
    status: normalizeStepStatus(ps.status),
    data_needed: ps.data_needed ?? [],
    data_received: { ...(ps.data_received ?? {}), ...(ps.tool_arguments ?? {}) },
    handler: TOOL_TO_HANDLER[ps.tool ?? ''] ?? ps.tool ?? 'reprompter',
    requires_isolation: ps.requires_isolation ?? false,
    verdict: ps.verdict ?? null,
    failure_reason: ps.failure_reason ?? null
  }
}

const normalizeStepStatus = (status?: string): Step['status'] => {
  switch (status) {
    case 'completed':
    case 'failed':
    case 'paused':
      return status
    default:
      return 'pending'
  }
}

const translateTask = (pt: PlannerTask): Task => {
  return {
    task_id: pt.task_id ?? `T-${Date.now()}`,
    goal: pt.goal ?? '',
    status: 'pending',
    failure_count: pt.failure_count ?? 0,
    max_retries: pt.max_retries ?? 3,
    steps: (pt.steps ?? []).map(translateStep),
    current_step: pt.current_step ?? 0
  }
}

const translateSession = (plan: PlannerSession, existingSession?: Session): Session => {
  if (existingSession) {
    const newCurrentTask = translateTask(plan.current_task ?? {})
    const newNextTasks = (plan.next_tasks ?? []).map(translateTask)
    return {
      ...existingSession,
      title: plan.title || existingSession.title || 'Session',
      main_goal: plan.main_goal || existingSession.main_goal,
      status: 'active',
      current_task: newCurrentTask,
      next_tasks: newNextTasks,
      pending_reply: null
    }
  }

  return {
    session_id: plan.session_id ?? `S-${Date.now()}`,
    title: plan.title ?? '',
    main_goal: plan.main_goal ?? '',
    status: plan.status === 'active' ? 'active' : 'active',
    current_task: translateTask(plan.current_task ?? {}),
    next_tasks: (plan.next_tasks ?? []).map(translateTask),
    task_history: [],
    outputs: {},
    is_followup: plan.is_followup ?? false,
    conversation_log: [],
    main_goal_completed: false,
    pending_reply: null
  }
}
const ensureUniqueTaskIds = (plan: PlannerSession): PlannerSession => {
  // Collect the old IDs in the order they appear so new IDs are deterministic.
  const oldIds: string[] = []
  const seen = new Set<string>()
  const collect = (t?: PlannerTask) => {
    if (!t?.task_id || seen.has(t.task_id)) return
    seen.add(t.task_id)
    oldIds.push(t.task_id)
  }
  collect(plan.current_task)
  ;(plan.next_tasks ?? []).forEach(collect)

  if (oldIds.length === 0) return plan

  const runStamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const idMap = new Map<string, string>()
  oldIds.forEach((oldId, i) => {
    idMap.set(oldId, `T-${runStamp}-${i + 1}`)
  })

  const rewriteId = (s: string): string => {
    let out = s
    for (const [oldId, newId] of idMap) {
      out = out.split(oldId).join(newId)
    }
    return out
  }

  const rewriteValue = (v: unknown): unknown => {
    if (typeof v === 'string') return rewriteId(v)
    if (Array.isArray(v)) return v.map(rewriteValue)
    if (v && typeof v === 'object') {
      const obj: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        obj[k] = rewriteValue(val)
      }
      return obj
    }
    return v
  }

  const rewriteTask = (t: PlannerTask) => {
    if (t.task_id) t.task_id = idMap.get(t.task_id) ?? t.task_id
    if (t.depends_on) t.depends_on = t.depends_on.map((id) => idMap.get(id) ?? id)
    for (const s of t.steps ?? []) {
      if (s.tool_arguments)
        s.tool_arguments = rewriteValue(s.tool_arguments) as Record<string, unknown>
      if (s.data_received)
        s.data_received = rewriteValue(s.data_received) as Record<string, unknown>
    }
  }

  if (plan.current_task) rewriteTask(plan.current_task)
  ;(plan.next_tasks ?? []).forEach(rewriteTask)

  return plan
}
const logTaskState = (s: Session, label: string) => {
  const t = s.current_task
  const steps = t?.steps ?? []
  const current = t?.current_step ?? 0
  const active = steps[current]
  console.log(
    `[RUN] ${label} → task ${t?.task_id ?? '?'} "${t?.goal ?? ''}" | step ${current + 1}/${steps.length}` +
      (active ? ` (${active.handler})` : '') +
      ` | task status: ${t?.status ?? '?'} | session status: ${s.status}`
  )
}
export {
  buildToolCatalogText,
  TOOL_TO_HANDLER,
  translateStep,
  translateTask,
  translateSession,
  ensureUniqueTaskIds,
  logTaskState
}
