import axios from 'axios'
import type { ToolResult } from './tool.Type.js'
import { buildResult } from './utils/buildResult.js'

const BASE_URL = process.env.PLATFORM_API_URL?.trim() || 'http://localhost:3000/recruitment'
const API_TOKEN = process.env.PLATFORM_API_TOKEN?.trim() || ''
const AGENT_ROLE = (process.env.PLATFORM_AGENT_ROLE?.trim() || 'admin').toLowerCase()

export type PlatformEntityType =
  'candidate' | 'recruiter' | 'job' | 'application' | 'interview' | 'shortlist' | 'message'
export type PlatformOperation =
  | 'get'
  | 'search'
  | 'update'
  | 'create'
  | 'delete'
  | 'add_note'
  | 'shortlist_add'
  | 'shortlist_remove'

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
  application: 'applications',
  interview: 'interviews',
  shortlist: 'shortlists',
  message: 'messages'
}

const STANDARD_ENTITIES: PlatformEntityType[] = [
  'candidate',
  'recruiter',
  'job',
  'application',
  'interview'
]

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
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
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
      'shortlists',
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

const resolveField = (record: Record<string, unknown>, field: string): unknown => {
  const norm = field.trim().toLowerCase()
  const aliasPaths: Record<string, string[]> = {
    name: ['personal_details', 'full_name'],
    full_name: ['personal_details', 'full_name'],
    title: ['personal_details', 'title_or_position'],
    title_or_position: ['personal_details', 'title_or_position'],
    email: ['personal_details', 'contact', 'email'],
    phone: ['personal_details', 'contact', 'phone'],
    address: ['personal_details', 'contact', 'address'],
    location: ['personal_details', 'contact', 'address'],
    address_summary: ['professional', 'summary'],
    summary: ['professional', 'summary'],
    skills: ['professional', 'skills'],
    jobtitle: ['appliedJobTitle'],
    appliedjobtitle: ['appliedJobTitle'],
    appliedjobid: ['appliedJobId'],
    appliedrole: ['appliedJobTitle'],
    role: ['appliedJobTitle']
  }
  const path = aliasPaths[norm] ?? field.split('.')
  let value: unknown = record
  for (const key of path) {
    if (value == null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

const projectFields = (
  record: Record<string, unknown>,
  fields?: string[]
): Record<string, unknown> => {
  if (!fields || fields.length === 0) return record
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    const value = resolveField(record, field)
    if (value !== undefined) out[field] = value
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
    /\b(all|every|any|each)\s+(of\s+)?the\s+(candidates|recruiters|jobs|applications|interviews|shortlists|people|records|items)\b/.test(
      q
    )
  )
    return true
  return false
}

const displayName = (record: Record<string, unknown>): string => {
  const name = resolveField(record, 'name')
  return typeof name === 'string' && name.length > 0 ? name : ''
}

const flattenFirstRecord = (records: Record<string, unknown>[]): Record<string, unknown> => {
  const first = records[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) return {}
  const out: Record<string, unknown> = {}
  const add = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') out[key] = value
  }
  add('name', first.name)
  add('email', first.email)
  add('phone', first.phone)
  add('applications', first.applications)
  add('appliedJobTitle', first.appliedJobTitle)
  add('appliedJobId', first.appliedJobId)
  add('appliedRole', first.appliedJobTitle)
  add('role', first.appliedJobTitle)
  add('jobTitle', first.appliedJobTitle)
  return out
}

const enrichCandidate = (record: Record<string, unknown>): Record<string, unknown> => {
  const applications = Array.isArray(record.applications) ? record.applications : []
  const firstWithTitle = applications.find(
    (a) => a && typeof a === 'object' && typeof (a as Record<string, unknown>).jobTitle === 'string'
  ) as Record<string, unknown> | undefined
  const firstWithJob = applications.find(
    (a) => a && typeof a === 'object' && typeof (a as Record<string, unknown>).jobId === 'string'
  ) as Record<string, unknown> | undefined
  return {
    ...record,
    name: (record.name as string) ?? (resolveField(record, 'name') as string) ?? '',
    email: (record.email as string) ?? (resolveField(record, 'email') as string) ?? '',
    phone: (record.phone as string) ?? (resolveField(record, 'phone') as string) ?? '',
    applications,
    ...(firstWithTitle?.jobTitle ? { appliedJobTitle: firstWithTitle.jobTitle as string } : {}),
    ...(firstWithJob?.jobId ? { appliedJobId: firstWithJob.jobId as string } : {})
  }
}

const recruitmentPlatformSubAgent = async (args: PlatformToolArguments): Promise<ToolResult> => {
  const entityType = (args.entityType ?? 'candidate') as PlatformEntityType
  const operation = (args.operation ?? 'get') as PlatformOperation
  const collection = COLLECTIONS[entityType] ?? COLLECTIONS.candidate
  const isStandard = STANDARD_ENTITIES.includes(entityType)

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
        if (entityType === 'shortlist') {
          if (!args.entityId) {
            return buildResult(args, false, {}, 'get shortlist requires entityId (the jobId).')
          }
          const payload = await platformRequest(
            'get',
            `/shortlists/${encodeURIComponent(args.entityId)}`
          )
          output = unwrapRecord(payload)
        } else if (isStandard) {
          if (args.entityId) {
            const payload = await platformRequest(
              'get',
              `/${collection}/${encodeURIComponent(args.entityId)}`
            )
            const record =
              entityType === 'candidate'
                ? enrichCandidate(unwrapRecord(payload))
                : unwrapRecord(payload)
            output = projectFields(record, args.fieldsRequested)
          } else if (args.entityName) {
            const payload = await platformRequest(
              'get',
              `/${collection}?name=${encodeURIComponent(args.entityName)}`
            )
            const records = unwrapArray(payload)
            const enriched =
              entityType === 'candidate' ? records.map((r) => enrichCandidate(r)) : records
            const record = enriched[0]
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
        } else {
          return buildResult(args, false, {}, `get is not available for entity '${entityType}'.`)
        }
        break
      }
      case 'search': {
        const params = new URLSearchParams()
        if (entityType === 'candidate' || entityType === 'recruiter') {
          if (!isListAllQuery(args.query)) params.set('search', args.query as string)
          if (args.entityName) params.set('name', args.entityName)
        } else if (entityType === 'application') {
          if (args.query) params.set('status', args.query as string)
          if (args.entityId) params.set('candidateId', args.entityId)
        } else if (entityType === 'interview') {
          if (args.query) params.set('status', args.query as string)
          if (args.entityId) params.set('candidateId', args.entityId)
          if (args.updates && typeof args.updates.jobId === 'string')
            params.set('jobId', args.updates.jobId)
        } else if (entityType === 'shortlist') {
          if (args.entityId) params.set('jobId', args.entityId)
        }
        const payload = await platformRequest('get', `/${collection}?${params.toString()}`)
        const records = unwrapArray(payload)
        const projected = records.map((r) => {
          const enriched = entityType === 'candidate' ? enrichCandidate(r) : r
          const p = projectFields(enriched, args.fieldsRequested)
          if (entityType !== 'candidate') return p
          return {
            ...p,
            applications: enriched.applications ?? [],
            ...(enriched.appliedJobTitle ? { appliedJobTitle: enriched.appliedJobTitle } : {}),
            ...(enriched.appliedJobId ? { appliedJobId: enriched.appliedJobId } : {})
          }
        })
        output = {
          results: projected,
          count: records.length,
          ...(collection === 'candidates' || collection === 'recruiters'
            ? {
                names: records.map(displayName).filter((n) => n.length > 0),
                candidate_names: records.map(displayName).filter((n) => n.length > 0)
              }
            : {}),

          ...(collection === 'candidates' || collection === 'recruiters'
            ? flattenFirstRecord(projected)
            : {})
        }
        break
      }
      case 'create': {
        if (!args.updates) {
          return buildResult(args, false, {}, 'create requires updates.')
        }
        let url = `/${collection}`
        if (entityType === 'job' && args.updates && typeof args.updates.title === 'string') {
          url = '/jobs'
        } else if (entityType === 'application') {
          url = '/applications'
        } else if (entityType === 'interview') {
          url = '/interviews'
        } else if (entityType === 'message') {
          url = '/messages'
        } else if (entityType === 'shortlist') {
          url = '/shortlists'
        }
        const payload = await platformRequest('post', url, args.updates)
        const created = unwrapRecord(payload)
        output =
          entityType === 'message'
            ? { sent: true, record: created }
            : { created: true, record: created }
        break
      }
      case 'update': {
        if (entityType === 'shortlist') {
          if (!args.updates || !Array.isArray(args.updates.candidateIds)) {
            return buildResult(
              args,
              false,
              {},
              'update shortlist requires entityId (jobId) and updates.candidateIds[].'
            )
          }
          const payload = await platformRequest('post', '/shortlists', {
            jobId: args.entityId,
            candidateIds: args.updates.candidateIds
          })
          output = { updated: true, record: unwrapRecord(payload) }
          break
        }
        if (['message'].includes(entityType)) {
          return buildResult(args, false, {}, `update is not available for entity '${entityType}'.`)
        }
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
        if (entityType === 'shortlist') {
          if (!args.entityId)
            return buildResult(args, false, {}, 'delete shortlist requires entityId (jobId).')
          await platformRequest('delete', `/shortlists/${encodeURIComponent(args.entityId)}`)
          output = { deleted: true, entityType, entityId: args.entityId }
          break
        }
        if (!isStandard) {
          return buildResult(args, false, {}, `delete is not available for entity '${entityType}'.`)
        }
        if (!args.entityId) return buildResult(args, false, {}, 'delete requires entityId.')
        await platformRequest('delete', `/${collection}/${encodeURIComponent(args.entityId)}`)
        output = { deleted: true, entityType, entityId: args.entityId }
        break
      }
      case 'add_note': {
        if (!isStandard) {
          return buildResult(
            args,
            false,
            {},
            `add_note is not available for entity '${entityType}'.`
          )
        }
        if (!args.entityId || !args.updates) {
          return buildResult(args, false, {}, 'add_note requires entityId and updates.note.')
        }
        const body =
          typeof args.updates.note === 'string'
            ? { note: args.updates.note, author: args.updates.author }
            : { ...args.updates }
        const payload = await platformRequest(
          'post',
          `/${collection}/${encodeURIComponent(args.entityId)}/notes`,
          body
        )
        output = { noted: true, record: unwrapRecord(payload) }
        break
      }
      case 'shortlist_add': {
        if (!args.entityId || !args.updates || !Array.isArray(args.updates.candidateIds)) {
          return buildResult(
            args,
            false,
            {},
            'shortlist_add requires entityId (jobId) and updates.candidateIds[].'
          )
        }
        const payload = await platformRequest(
          'post',
          `/shortlists/${encodeURIComponent(args.entityId)}/add`,
          { candidateIds: args.updates.candidateIds }
        )
        output = { shortlisted: true, record: unwrapRecord(payload) }
        break
      }
      case 'shortlist_remove': {
        if (!args.entityId || !args.updates || !Array.isArray(args.updates.candidateIds)) {
          return buildResult(
            args,
            false,
            {},
            'shortlist_remove requires entityId (jobId) and updates.candidateIds[].'
          )
        }
        const payload = await platformRequest(
          'post',
          `/shortlists/${encodeURIComponent(args.entityId)}/remove`,
          { candidateIds: args.updates.candidateIds }
        )
        output = { removed: true, record: unwrapRecord(payload) }
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

export interface JobApplyLinkResult {
  success: boolean
  applyUrl?: string
  title?: string
  jobId?: string
  error?: string
}

const getJobApplyUrl = async (jobId: string): Promise<JobApplyLinkResult> => {
  if (!jobId) return { success: false, error: 'jobId is required.' }
  try {
    const payload = await platformRequest('get', `/jobs/${encodeURIComponent(jobId)}/link`)
    const record = unwrapRecord(payload)
    const applyUrl = typeof record.applyUrl === 'string' ? record.applyUrl : undefined
    if (!applyUrl) {
      return { success: false, error: `No application link was returned for job "${jobId}".` }
    }
    return {
      success: true,
      applyUrl,
      jobId: typeof record.jobId === 'string' ? record.jobId : jobId,
      title: typeof record.title === 'string' ? record.title : undefined
    }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}
export {
  recruitmentPlatformSubAgent,
  getJobApplyUrl,
  errorMessage,
  flattenFirstRecord,
  resolveField,
  projectFields,
  isListAllQuery,
  displayName,
  enrichCandidate,
  unwrapRecord,
  unwrapArray
}
