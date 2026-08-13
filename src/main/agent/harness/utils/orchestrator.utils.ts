import { Session, Task } from '../types/types.Session'
const collectTaskOutputs = (task: Task): Record<string, unknown> => {
  const outputs: Record<string, unknown> = {}
  for (const s of task.steps) {
    if (s.status === 'completed' && s.data_received) {
      Object.assign(outputs, s.data_received)
    }
  }
  return outputs
}
const escalate = (
  session: Session,
  task: Task,
  reason: string,
  onTaskEnd?: (info: {
    task_id: string
    task_goal: string
    status: 'completed' | 'failed' | 'escalated'
    outputs?: Record<string, unknown>
    failure_reason?: string | null
  }) => void
) => {
  task.status = 'failed'
  session.status = 'escalated'
  session.pending_reply = null
  session.task_history.push({
    task_id: task.task_id,
    goal: task.goal,
    status: 'escalated',
    completed_at: new Date().toISOString()
  })
  const active = task.steps[task.current_step]
  if (active) {
    active.status = 'failed'
    active.verdict = 'fail'
    active.failure_reason = reason
  }
  onTaskEnd?.({
    task_id: task.task_id,
    task_goal: task.goal,
    status: 'escalated',
    outputs: collectTaskOutputs(task),
    failure_reason: reason
  })
}
// Resolves placeholders in a value (string, array, or object) using outputs from previous tasks.
// Placeholders are in the form {{taskId.output.fieldName}}. If csv is true, arrays are converted to CSV strings.
const resolveValuePlaceholders = (
  value: unknown,
  outputsByTask: Record<string, Record<string, unknown>>,
  csv = false
): unknown => {
  /** Walk a dotted + bracketed JSON path like `results[0].email` or
   *  `results[0].personal_details.contact.email` through the output object. */
  const resolvePath = (root: unknown, pathStr: string): unknown => {
    let current: unknown = root
    const segments = pathStr
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter((s) => s !== '')
    for (const seg of segments) {
      if (current == null) return undefined
      if (/^\d+$/.test(seg) && Array.isArray(current)) {
        current = current[Number(seg)]
      } else if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[seg]
      } else {
        return undefined
      }
    }
    return current
  }

  const renderResolved = (v: unknown): string => {
    if (typeof v === 'string') return v
    if (Array.isArray(v) && v.every((item) => typeof item === 'string')) return v.join('\n')
    if (csv && Array.isArray(v)) return toCsv(v)
    return JSON.stringify(v)
  }

  if (typeof value === 'string') {
    return value.replace(
      /\{\{\s*([Tt][A-Za-z0-9_-]+)\s*\.\s*output\s*(?:\.?\s*([^\s{}]+))?\s*\}\}/g,
      (match, taskId, rawField) => {
        const out = outputsByTask[taskId]
        if (!out) return match
        const field = (rawField ?? '').trim()

        // Fast path: a plain `field` name directly on the output object.
        if (field && /^[A-Za-z0-9_]+$/.test(field) && field in out) {
          return renderResolved(out[field])
        }

        // Dotted / indexed path (e.g. results[0].email). Resolve generically
        // instead of leaving a literal placeholder for the consuming tool.
        if (field && !/^[A-Za-z0-9_]+$/.test(field)) {
          const v = resolvePath(out, field)
          if (v === undefined) return match
          return renderResolved(v)
        }

        // Fallback: planners commonly write {{task.output.candidate_details}},
        // {{task.output.details}}, {{task.output.candidate_info}}, etc. Render the
        // record set we actually have (results) as readable text so the request
        // still succeeds instead of emitting a literal unresolved placeholder.
        if (/^(candidate_)?(details|info|information|profile|record|summary|data)$/i.test(field)) {
          const results = out.results
          if (Array.isArray(results)) {
            if (csv) return toCsv(results)
            return results
              .map((r) =>
                typeof r === 'object' && r !== null
                  ? Object.entries(r as Record<string, unknown>)
                      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
                      .join('\n')
                  : String(r)
              )
              .join('\n\n')
          }
        }
        // Fallback: file-read tasks store their content under `output`, so
        // {{task.output.content}} / {{task.output.file_content}} must resolve to
        // that instead of staying literal.
        if (/^(content|file_content|text|body|message|payload)$/i.test(field)) {
          const inner = out.output
          if (typeof inner === 'string') return inner
          if (inner && typeof inner === 'object') {
            const record = inner as Record<string, unknown>
            if (typeof record.content === 'string') return record.content
            if (typeof record.output === 'string') return record.output
            if (typeof record.text === 'string') return record.text
          }
        }
        // Fallback: {{task.output.field}} when the field is actually nested under
        // the first search result (planners reference lookup outputs top-level
        // even though tools nest records under `results`). Also maps the common
        // "applied role" phrasing to the tool's appliedJobTitle field.
        if (field) {
          const results = out.results
          if (Array.isArray(results) && results.length > 0) {
            const first = results[0]
            if (first && typeof first === 'object' && !Array.isArray(first)) {
              for (const exact of [field, field.toLowerCase()]) {
                if (exact in (first as Record<string, unknown>)) {
                  const v = resolvePath(out, `results[0].${exact}`)
                  if (v !== undefined) return renderResolved(v)
                }
              }
              const aliasOf: Record<string, string> = {
                role: 'appliedJobTitle',
                appliedrole: 'appliedJobTitle',
                jobtitle: 'appliedJobTitle',
                application: 'applications',
                appliedjob: 'applications'
              }
              const target = aliasOf[field.toLowerCase()]
              if (target && target in (first as Record<string, unknown>)) {
                const v = resolvePath(out, `results[0].${target}`)
                if (v !== undefined) return renderResolved(v)
              }
            }
          }
        }
        return match
      }
    )
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveValuePlaceholders(v, outputsByTask, csv))
  }
  if (value && typeof value === 'object') {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      obj[k] = resolveValuePlaceholders(v, outputsByTask, csv)
    }
    return obj
  }
  return value
}
const toCsv = (records: unknown[]): string => {
  const rows = records
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => r)
  if (rows.length === 0) return ''
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const escape = (v: unknown): string => {
    const s =
      v === null || v === undefined
        ? ''
        : Array.isArray(v)
          ? v.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('; ')
          : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}
// Returns a map of task_id to outputs for all completed tasks in the session's task history.
const outputsByTask = (session: Session): Record<string, Record<string, unknown>> => {
  const map: Record<string, Record<string, unknown>> = {}
  for (const entry of session.task_history) {
    if (entry.outputs) map[entry.task_id] = entry.outputs
  }
  return map
}

const resolveStepPlaceholders = (task: Task, session: Session): void => {
  const map = outputsByTask(session)
  for (const s of task.steps) {
    if (!s.data_received) continue
    const args = s.data_received as Record<string, unknown>
    // A file_system write to a *.csv path should render resolved record arrays as CSV.
    const writesCsv =
      s.handler === 'file_system' &&
      args.operation === 'write' &&
      typeof args.filePath === 'string' &&
      /\.csv$/i.test(args.filePath)
    s.data_received = resolveValuePlaceholders(s.data_received, map, writesCsv) as Record<
      string,
      unknown
    >
  }
}

export {
  escalate,
  resolveValuePlaceholders,
  outputsByTask,
  resolveStepPlaceholders,
  toCsv,
  collectTaskOutputs
}
