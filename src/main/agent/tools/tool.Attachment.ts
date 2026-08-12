import fs from 'fs/promises'
import path from 'path'
import { resolveLocalPath } from './utils/pathResolver'

export interface PreparedAttachment {
  name: string
  content: string // base64
  mimeType: string
}

// its a file path or an object with path and optional name used to reference a local file to be attached to a request.
export type AttachmentInput = string | { path: string; name?: string }

const MIME_BY_EXT: Record<string, string> = {
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
}

const mimeFor = (fileName: string): string => {
  return MIME_BY_EXT[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream'
}

//read local files passed by the planner and return them as base64  to be sent as attahmenets
export const prepareAttachments = async (
  attachments: AttachmentInput[] | undefined
): Promise<PreparedAttachment[]> => {
  if (!Array.isArray(attachments) || attachments.length === 0) return []
  const prepared: PreparedAttachment[] = []
  for (const entry of attachments) {
    const rawPath = typeof entry === 'string' ? entry : entry?.path
    if (!rawPath || typeof rawPath !== 'string' || rawPath.trim() === '') {
      throw new Error('Each attachment must be a file path string or { path, name? } object')
    }
    const resolved = resolveLocalPath(rawPath)
    const data = await fs.readFile(resolved).catch((err: NodeJS.ErrnoException) => {
      throw new Error(
        `Could not read attachment "${rawPath}" (resolved to ${resolved}): ${err.message}`
      )
    })
    const name =
      typeof entry === 'string'
        ? path.basename(resolved)
        : entry.name?.trim() || path.basename(resolved)
    prepared.push({ name, content: data.toString('base64'), mimeType: mimeFor(name) })
  }
  return prepared
}
