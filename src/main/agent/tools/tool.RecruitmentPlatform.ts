import axios from 'axios'
import type { ToolResult } from './tool.Type.js'
import { buildResult } from './utils/buildResult.js'

const BASE_URL = process.env.PLATFORM_API_URL?.trim() || 'http://localhost:3000'
const API_TOKEN = process.env.PLATFORM_API_TOKEN?.trim() || ''
const AGENT_ROLE = (process.env.PLATFORM_AGENT_ROLE?.trim() || 'recruiter').toLowerCase()

export type PlatformEntityType = 'candidate' | 'recruiter' | 'job' | 'application'
export type PlatformOperation = 'get' | 'search' | 'update' | 'create' | 'delete' | 'add_note'

export interface PlatformToolArguments {
  taskId?: string
  step_number?: number
  tool?: string
  entityType?: PlatformEntityType
  operation?: PlatformOperation
  entityId?: string
  entityName?: string
  query?: string
  fieldsRequested?: string[]
  updates?: Record<string, unknown>
  approved?: boolean
  instructions?: string
  [key: string]: unknown
}

const COLLECTIONS: Record<PlatformEntityType, string> = {
  candidate: 'candidates',
  recruiter: 'recruiters',
  job: 'jobs',
  application: 'applications'
}

const errorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as
      { error?: string | { message?: string }; message?: string } | undefined
    const detail =
      typeof data?.error === 'string' ? data.error : (data?.error?.message ?? data?.message)
    if (status === 401) return `Platform auth failed (401): ${detail ?? err.message}`
    if (status === 403)
      return `Permission denied by platform (${AGENT_ROLE} role): ${detail ?? err.message}`
    if (status === 404) return `Not found on platform (404): ${detail ?? err.message}`
    return detail ?? err.message
  }
  return err instanceof Error ? err.message : String(err)
}

const platformRequest = async (
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  body?: unknown
): Promise<unknown> => {
  const res = await axios({
    method,
    url: `${BASE_URL}${url}`,
    data: body,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    timeout: 20000,
    validateStatus: (status) => status >= 200 && status < 300
  })
  return res.data
}

const unwrapRecord = (payload: unknown): Record<string, unknown> => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>
    if ('data' in p && p.data && typeof p.data === 'object' && !Array.isArray(p.data)) {
      return p.data as Record<string, unknown>
    }
    return p
  }
  return {}
}

const unwrapArray = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    // Handle the server's keyed response shapes (e.g. { candidates: [...] }).
    for (const key of [
      'candidates',
      'recruiters',
      'jobs',
      'applications',
      'interviews',
      'notes',
      'data',
      'records',
      'results',
      'items'
    ]) {
      const v = p[key]
      if (Array.isArray(v)) return v as Record<string, unknown>[]
    }
    // Fallback: if a single record object was returned, wrap it.
    if (!('pagination' in p)) {
      return [p]
    }
  }
  return []
}

const projectFields = (
  record: Record<string, unknown>,
  fields?: string[]
): Record<string, unknown> => {
  if (!fields || fields.length === 0) return record
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (field in record) out[field] = record[field]
  }
  return out
}

/**
 * Generic "list everything" phrasings should NOT become a substring `search`
 * filter (e.g. "all candidates" would match zero records). Return true when the
 * query is empty or just filler ("all", "every", "list all", "all candidates",
 * "any", "each", "show all", etc.) so the caller can skip the search param.
 */
const isListAllQuery = (query: string | undefined): boolean => {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (/^(all|any|each|every|everyone|everything|the\s+lot)\b/.test(q)) return true
  if (
    /^(list|show|get|fetch|return|retrieve|display)\s+(me\s+|us\s+)?(all|every|any|each)\b/.test(q)
  )
    return true
  if (
    /\b(all|every|any|each)\s+(of\s+)?the\s+(candidates|recruiters|jobs|applications|people|records|items)\b/.test(
      q
    )
  )
    return true
  return false
}

export const recruitmentPlatformSubAgent = async (
  args: PlatformToolArguments
): Promise<ToolResult> => {
  const entityType = (args.entityType ?? 'candidate') as PlatformEntityType
  const operation = (args.operation ?? 'get') as PlatformOperation
  const collection = COLLECTIONS[entityType] ?? COLLECTIONS.candidate

  const reassigns =
    operation === 'update' && !!args.updates && 'assignedRecruiterId' in args.updates
  const needsApproval = (operation === 'delete' || reassigns) && AGENT_ROLE !== 'admin'

  if (needsApproval && args.approved !== true) {
    return buildResult(
      args,
      false,
      {},
      'Blocked: this platform action requires human approval. An approval_gate step must run first; once it passes, its approved=true output is forwarded and this operation will execute.'
    )
  }

  try {
    let output: Record<string, unknown> | string
    switch (operation) {
      case 'get': {
        if (args.entityId) {
          const payload = await platformRequest(
            'get',
            `/${collection}/${encodeURIComponent(args.entityId)}`
          )
          output = projectFields(unwrapRecord(payload), args.fieldsRequested)
        } else if (args.entityName) {
          const payload = await platformRequest(
            'get',
            `/${collection}?name=${encodeURIComponent(args.entityName)}`
          )
          const records = unwrapArray(payload)
          const record = records[0]
          if (!record) {
            return buildResult(
              args,
              false,
              {},
              `No ${entityType} found matching "${args.entityName}".`
            )
          }
          output = projectFields(record, args.fieldsRequested)
        } else {
          return buildResult(args, false, {}, 'get requires entityId or entityName.')
        }
        break
      }
      case 'search': {
        const params = new URLSearchParams()
        // The server's /candidates route filters by `search`, `name`, `skills`,
        // `location`, `title`. Pass the query through as `search` — but skip the
        // filter entirely for generic "list everything" phrasings, otherwise
        // "all candidates" becomes a substring match and returns zero records.
        if (!isListAllQuery(args.query)) params.set('search', args.query as string)
        if (args.entityName) params.set('name', args.entityName)
        const payload = await platformRequest('get', `/${collection}?${params.toString()}`)
        const records = unwrapArray(payload)
        const projected = records.map((r) => projectFields(r, args.fieldsRequested))
        output = {
          results: projected,
          count: records.length,
          // Convenience: a flat list of names when candidates/recruiters were searched,
          // so plans can reference {{task.output.names}} directly. `candidate_names` is
          // an alias for the same list (planners commonly guess that field name).
          ...(collection === 'candidates' || collection === 'recruiters'
            ? {
                names: records
                  .map((r) => r.name)
                  .filter((n): n is string => typeof n === 'string' && n.length > 0),
                candidate_names: records
                  .map((r) => r.name)
                  .filter((n): n is string => typeof n === 'string' && n.length > 0)
              }
            : {})
        }
        break
      }
      case 'create': {
        if (!args.updates) {
          return buildResult(args, false, {}, 'create requires updates.')
        }
        const payload = await platformRequest('post', `/${collection}`, args.updates)
        output = { created: true, record: unwrapRecord(payload) }
        break
      }
      case 'update': {
        if (!args.entityId || !args.updates) {
          return buildResult(args, false, {}, 'update requires entityId and updates.')
        }
        const payload = await platformRequest(
          'patch',
          `/${collection}/${encodeURIComponent(args.entityId)}`,
          args.updates
        )
        output = { updated: true, record: unwrapRecord(payload) }
        break
      }
      case 'delete': {
        if (!args.entityId) {
          return buildResult(args, false, {}, 'delete requires entityId.')
        }
        await platformRequest('delete', `/${collection}/${encodeURIComponent(args.entityId)}`)
        output = { deleted: true, entityType, entityId: args.entityId }
        break
      }
      case 'add_note': {
        if (!args.entityId || !args.updates) {
          return buildResult(args, false, {}, 'add_note requires entityId and updates.note.')
        }
        const body =
          typeof args.updates.note === 'string' ? { note: args.updates.note } : { ...args.updates }
        const payload = await platformRequest(
          'post',
          `/${collection}/${encodeURIComponent(args.entityId)}/notes`,
          body
        )
        output = { noted: true, record: unwrapRecord(payload) }
        break
      }
      default:
        return buildResult(args, false, {}, `Unknown platform operation: ${String(operation)}`)
    }
    return buildResult(args, true, output)
  } catch (err) {
    return buildResult(args, false, {}, errorMessage(err))
  }
}
