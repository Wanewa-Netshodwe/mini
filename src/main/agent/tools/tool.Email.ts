import axios from 'axios'
import type { ToolResult } from './tool.Type.js'
import { prepareAttachments } from './tool.Attachment'
import type { AttachmentInput, PreparedAttachment } from './tool.Attachment'
import { buildResult } from './utils/buildResult.js'

const BASE_URL =
  process.env.EMAIL_SERVER_URL?.trim() ||
  process.env.COMMS_SERVER_URL?.trim() ||
  'http://localhost:3000'

export interface EmailToolArguments {
  taskId?: string
  step_number?: number
  tool?: string
  recipient?: string
  to?: string
  subject?: string
  body?: string
  isHtml?: boolean
  instructions?: string
  attachments?: AttachmentInput[]
  [key: string]: unknown
}

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined
    return data?.error ?? data?.message ?? err.message
  }
  return err instanceof Error ? err.message : String(err)
}

const PLACEHOLDER_RE = /\{\{\s*[^}]+\}\}/g

// A leftover "{{...output.results[0].field}}" token means a template reference
// did not resolve. Never ship that literal text to a real recipient — remove it
// (and collapse the resulting double spaces) so the message reads cleanly.
function stripUnresolvedPlaceholders(text: string): string {
  return text
    .replace(PLACEHOLDER_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export async function emailSubAgent(args: EmailToolArguments): Promise<ToolResult> {
  const recipient = (args.recipient ?? args.to)?.trim()
  const subject = args.subject?.trim()
  const body = args.body

  if (!recipient) return buildResult(args, false, {}, 'recipient (email address) is required')
  if (!subject) return buildResult(args, false, {}, 'subject is required')
  if (!body) return buildResult(args, false, {}, 'body is required')

  // Never send to — or with content containing — an unresolved template reference.
  // A recipient that is still a "{{...}}" token means a lookup failed upstream.
  if (PLACEHOLDER_RE.test(recipient)) {
    return buildResult(
      args,
      false,
      {},
      'recipient still contains an unresolved template placeholder ({{...}}). Re-run the lookup step so a real email address is supplied.'
    )
  }

  const safeSubject = stripUnresolvedPlaceholders(subject)
  const safeBody = stripUnresolvedPlaceholders(body)

  let attachments: PreparedAttachment[] = []
  if (args.attachments) {
    try {
      attachments = await prepareAttachments(args.attachments)
    } catch (err) {
      return buildResult(args, false, {}, errorMessage(err))
    }
  }

  try {
    const res = await axios({
      method: 'post',
      url: `${BASE_URL}/email/send`,
      data: {
        to: recipient,
        subject: safeSubject,
        body: safeBody,
        ...(typeof args.isHtml === 'boolean' ? { isHtml: args.isHtml } : {}),
        ...(attachments.length > 0 ? { attachments } : {})
      },
      timeout: 30000,
      validateStatus: (status) => status >= 200 && status < 300
    })
    return buildResult(args, true, res.data as Record<string, unknown>)
  } catch (err) {
    return buildResult(args, false, {}, errorMessage(err))
  }
}
