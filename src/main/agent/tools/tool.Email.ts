import axios from 'axios'
import type { ToolResult } from './tool.Type.js'
import { prepareAttachments } from './tool.Attachment'
import type { AttachmentInput, PreparedAttachment } from './tool.Attachment'
import { buildResult } from './utils/buildResult.js'

const BASE_URL = process.env.SERVER_URL?.trim() || 'http://localhost:3000'
//the arguments the planner is going to pass to the email sub-agent tool, which will be used to send an email
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

const errorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined
    return data?.error ?? data?.message ?? err.message
  }
  return err instanceof Error ? err.message : String(err)
}

//email sub-agent tool that will be used to send an email
export const emailSubAgent = async (args: EmailToolArguments): Promise<ToolResult> => {
  const recipient = (args.recipient ?? args.to)?.trim()
  const subject = args.subject?.trim()
  const body = args.body

  if (!recipient) return buildResult(args, false, {}, 'recipient (email address) is required')
  if (!subject) return buildResult(args, false, {}, 'subject is required')
  if (!body) return buildResult(args, false, {}, 'body is required')

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
        subject,
        body,
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
