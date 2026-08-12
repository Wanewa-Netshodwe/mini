import { runReprompter } from '../../LLM/service/rePrompter.Service'
import { emailSubAgent, EmailToolArguments } from '../../tools/tool.Email'
import { AttachmentInput } from '../../tools/tool.Attachment'
import fileSystemTool from '../../tools/tool.FileSystem'
import microsoftWordTool from '../../tools/tool.MicrosoftWord'
import shellTool from '../../tools/tool.Shell'
import { HandlerFunction } from '../types/types.Harness'
import { Session } from '../types/types.Session'
import { whatsappSubAgent, WhatsAppToolArguments } from '../../tools/tool.Whatsapp'
import {
  PlatformToolArguments,
  recruitmentPlatformSubAgent
} from '../../tools/tool.RecruitmentPlatform'
import {
  calendarTool,
  CalendarToolArguments,
  connectionTool,
  queryTool
} from '../../tools/tool.GoogleCalendar'

const resumeWithUserReply = (
  session: Session,
  correlationKey: string,
  reply: Record<string, unknown>
): Session => {
  const s: Session = JSON.parse(JSON.stringify(session))

  if (!s.pending_reply || s.pending_reply.correlation_key !== correlationKey) {
    throw new Error(
      `Session ${s.session_id} has no step waiting on correlation_key "${correlationKey}".`
    )
  }

  const task = s.current_task
  if (task.task_id !== s.pending_reply.task_id) {
    throw new Error(
      `pending_reply.task_id (${s.pending_reply.task_id}) does not match current_task (${task.task_id}) — session is stale.`
    )
  }

  const stepIdx = task.steps.findIndex((st) => st.step_number === s.pending_reply!.step_number)
  if (stepIdx === -1) {
    throw new Error(
      `pending_reply.step_number ${s.pending_reply.step_number} not found in current_task.`
    )
  }

  const step = task.steps[stepIdx]
  if (!step) {
    throw new Error(`Step at index ${stepIdx} not found in task ${task.task_id}.`)
  }
  step.data_received = { ...step.data_received, user_reply: reply }
  step.status = 'in_progress'
  step.verdict = null
  step.failure_reason = null
  task.current_step = stepIdx
  s.pending_reply = null
  s.status = 'active'
  return s
}
const summarizeArgs = (payload: Record<string, unknown>, maxLen = 500): string => {
  const compact: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (key === 'context' || key === 'inherited_context') {
      compact[key] = '[context]'
      continue
    }
    if (typeof value === 'string' && value.length > 60) {
      compact[key] = value.slice(0, 60) + '…'
    } else if (typeof value === 'object' && value !== null) {
      compact[key] =
        JSON.stringify(value).slice(0, 60) + (JSON.stringify(value).length > 60 ? '…' : '')
    } else {
      compact[key] = value
    }
  }
  const text = JSON.stringify(compact)
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}
const handlerRegistry: Record<string, HandlerFunction> = {
  reprompter: async (payload) => {
    return runReprompter(payload as any)
  },

  tool_result_formatter: async (payload) => {
    const raw = payload.raw_output as Record<string, unknown>
    return {
      verdict: 'pass',
      data: { formatted_payload: { content: JSON.stringify(raw).slice(0, 1000) } }
    }
  },

  file_system: async (payload) => {
    const { operation, filePath, content } = payload as {
      operation: 'read' | 'write' | 'delete'
      filePath: string
      content?: string
    }
    try {
      const res = await fileSystemTool({
        taskId: String(payload.task_id ?? ''),
        step_number: Number(payload.step_number ?? 0),
        tool: 'file_system',
        filePath,
        operation,
        ...(content !== undefined ? { content } : {})
      })
      if (!res.success) {
        return {
          verdict: 'fail',
          data: {},
          failure_reason: res.error ?? 'file system operation failed'
        }
      }
      return {
        verdict: 'pass',
        data: typeof res.output === 'string' ? { output: res.output } : res.output
      }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  shell: async (payload) => {
    const { command, cwd, timeoutMs } = payload as {
      command: string
      cwd?: string
      timeoutMs?: number
    }
    try {
      const res = await shellTool({
        taskId: String(payload.task_id ?? ''),
        step_number: Number(payload.step_number ?? 0),
        tool: 'shell',
        command,
        ...(cwd !== undefined ? { cwd } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs: Number(timeoutMs) } : {})
      })
      if (!res.success) {
        return { verdict: 'fail', data: {}, failure_reason: res.error ?? 'shell command failed' }
      }
      return {
        verdict: 'pass',
        data: typeof res.output === 'object' ? res.output : { output: res.output }
      }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  microsoft_word: async (payload) => {
    const { operation, filePath, content, exportFormat, exportPath } = payload as {
      operation: 'create' | 'edit' | 'read'
      filePath: string
      content?: string
      exportFormat?: string
      exportPath?: string
    }
    try {
      const res = await microsoftWordTool({
        taskId: String(payload.task_id ?? ''),
        step_number: Number(payload.step_number ?? 0),
        tool: 'microsoft_word',
        operation,
        filePath,
        ...(content !== undefined ? { content } : {}),
        ...(exportFormat !== undefined ? { exportFormat } : {}),
        ...(exportPath !== undefined ? { exportPath } : {})
      })
      if (!res.success) {
        return { verdict: 'fail', data: {}, failure_reason: res.error ?? 'Word operation failed' }
      }
      return {
        verdict: 'pass',
        data: typeof res.output === 'object' ? res.output : { output: res.output }
      }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  email_api: async (payload) => {
    const context = (payload.context ?? {}) as Record<string, unknown>
    const recipient = (payload.recipient ?? payload.to) as string | undefined
    const subject = payload.subject as string | undefined
    const body = payload.body as string | undefined
    const isHtml = payload.isHtml as boolean | undefined
    const instructions = payload.instructions as string | undefined
    const attachments = payload.attachments as AttachmentInput[] | undefined
    const args: EmailToolArguments = {
      ...context,
      taskId: String(payload.task_id ?? ''),
      step_number: Number(payload.step_number ?? 0),
      tool: 'email_sub_agent',
      ...(recipient !== undefined ? { recipient } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(isHtml !== undefined ? { isHtml } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
      ...(attachments !== undefined && attachments !== null ? { attachments } : {})
    }
    try {
      const res = await emailSubAgent(args)
      if (!res.success) {
        return { verdict: 'fail', data: {}, failure_reason: res.error ?? 'email send failed' }
      }
      return {
        verdict: 'pass',
        data: typeof res.output === 'string' ? { output: res.output } : res.output
      }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  whatsapp_api: async (payload) => {
    const { await_reply, timeout_seconds } = payload as {
      await_reply?: boolean
      timeout_seconds?: number
    }
    const context = (payload.context ?? {}) as Record<string, unknown>
    const recipient = (payload.recipient ?? payload.to) as string | undefined
    const message = payload.message as string | undefined
    const instructions = payload.instructions as string | undefined
    const attachments = payload.attachments as AttachmentInput[] | undefined
    const args: WhatsAppToolArguments = {
      ...context,
      taskId: String(payload.task_id ?? ''),
      step_number: Number(payload.step_number ?? 0),
      tool: 'whatsapp_sub_agent',
      ...(recipient !== undefined ? { recipient } : {}),
      ...(message !== undefined ? { message } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
      ...(attachments !== undefined && attachments !== null ? { attachments } : {})
    }
    try {
      const res = await whatsappSubAgent(args)
      if (!res.success) {
        return { verdict: 'fail', data: {}, failure_reason: res.error ?? 'whatsapp send failed' }
      }
      const sent = typeof res.output === 'string' ? { output: res.output } : res.output
      if (await_reply) {
        return {
          verdict: 'pass',
          data: sent,
          pause: {
            reason: 'waiting_for_user_reply',
            correlation_key: args.recipient ?? '',
            timeout_seconds: timeout_seconds ?? 24 * 60 * 60 // default 24h
          }
        }
      }
      return { verdict: 'pass', data: sent }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  recruitment_platform_sub_agent: async (payload) => {
    const context = (payload.context ?? {}) as Record<string, unknown>
    const args: PlatformToolArguments = {
      ...context,
      taskId: String(payload.task_id ?? ''),
      step_number: Number(payload.step_number ?? 0),
      tool: 'recruitment_platform_sub_agent'
    }
    try {
      const res = await recruitmentPlatformSubAgent(args)
      if (!res.success) {
        return {
          verdict: 'fail',
          data: {},
          failure_reason: res.error ?? 'platform operation failed'
        }
      }
      return {
        verdict: 'pass',
        data: typeof res.output === 'string' ? { output: res.output } : res.output
      }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  calendar_api: async (payload) => {
    const context = (payload.context ?? {}) as Record<string, unknown>
    const args: CalendarToolArguments = {
      ...context,
      taskId: String(payload.task_id ?? ''),
      step_number: Number(payload.step_number ?? 0),
      tool: 'calendar'
    }
    try {
      const res = await calendarTool(args)
      if (!res.success) {
        return {
          verdict: 'fail',
          data: {},
          failure_reason: res.error ?? 'calendar operation failed'
        }
      }
      return {
        verdict: 'pass',
        data: typeof res.output === 'string' ? { output: res.output } : res.output
      }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  google_calendar_connection: async (payload) => {
    const context = (payload.context ?? {}) as Record<string, unknown>
    const args: CalendarToolArguments = {
      ...context,
      taskId: String(payload.task_id ?? ''),
      step_number: Number(payload.step_number ?? 0),
      tool: 'google_calendar_connection'
    }
    try {
      const res = await connectionTool(args)
      if (!res.success) {
        return {
          verdict: 'fail',
          data: {},
          failure_reason: res.error ?? 'connection operation failed'
        }
      }
      return {
        verdict: 'pass',
        data: typeof res.output === 'string' ? { output: res.output } : res.output
      }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  google_calendar_query: async (payload) => {
    const context = (payload.context ?? {}) as Record<string, unknown>
    const args: CalendarToolArguments = {
      ...context,
      taskId: String(payload.task_id ?? ''),
      step_number: Number(payload.step_number ?? 0),
      tool: 'google_calendar_query'
    }
    try {
      const res = await queryTool(args)
      if (!res.success) {
        return { verdict: 'fail', data: {}, failure_reason: res.error ?? 'query operation failed' }
      }
      return {
        verdict: 'pass',
        data: typeof res.output === 'string' ? { output: res.output } : res.output
      }
    } catch (err) {
      return { verdict: 'fail', data: {}, failure_reason: (err as Error).message }
    }
  },

  sub_task_context_builder: async (payload) => {
    const { parent_task_id, step_number, step_instruction, inherited_context } = payload
    return {
      verdict: 'pass',
      data: {
        child_task_spec: {
          child_task_id: `${parent_task_id}-SUB-${step_number}`,
          parent_task_id,
          is_sub_task: true,
          task_instruction: step_instruction,
          inherited_context,
          timeout_seconds: 120
        }
      }
    }
  },

  approval_gate: async (payload) => {
    const { action_type, action_payload } = payload
    const autoApprove = ['send_email'].includes(action_type as string)

    if (autoApprove) {
      return { verdict: 'pass', data: { approved: true } }
    }

    return {
      verdict: 'fail',
      data: { approved: false },
      pause: {
        reason: 'approval_pending',
        approval_request: {
          title: `Approve ${action_type}`,
          urgency: 'normal',
          preview: action_payload
        }
      }
    }
  }
}
export { resumeWithUserReply, summarizeArgs, handlerRegistry }
