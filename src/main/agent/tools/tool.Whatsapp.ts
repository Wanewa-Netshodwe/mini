import axios from 'axios'
import type { ToolResult } from './tool.Type.js'
import {
  prepareAttachments,
  type AttachmentInput,
  type PreparedAttachment
} from './tool.Attachment.js'
import { buildResult } from './utils/buildResult.js'

const BASE_URL = process.env.SERVER_URL?.trim() || 'http://localhost:3000'

export interface WhatsAppToolArguments {
  taskId?: string
  step_number?: number
  tool?: string
  recipient?: string
  to?: string
  message?: string
  instructions?: string
  await_reply?: boolean
  timeout_seconds?: number
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

//whatsapp_sub_agent — send a WhatsApp message through the server's WhatsApp
export const whatsappSubAgent = async (args: WhatsAppToolArguments): Promise<ToolResult> => {
  const recipient = (args.recipient ?? args.to)?.trim()
  const message = args.message?.trim()

  if (!recipient) return buildResult(args, false, {}, 'recipient (phone number) is required')
  if (!message) return buildResult(args, false, {}, 'message is required')

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
      url: `${BASE_URL}/whatsapp/send`,
      data: { to: recipient, message, ...(attachments.length > 0 ? { attachments } : {}) },
      timeout: 30000,
      validateStatus: (status) => status >= 200 && status < 300
    })
    const data = res.data as Record<string, unknown>
    return buildResult(args, true, {
      ...data,
      delivery: 'queued; query GET /whatsapp/messages/:messageId for sent or failed status'
    })
  } catch (err) {
    return buildResult(args, false, {}, errorMessage(err))
  }
}
