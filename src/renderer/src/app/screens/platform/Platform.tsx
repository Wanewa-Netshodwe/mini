import { useState, useEffect, useCallback } from 'react'
import { AppWrapper } from '@renderer/app/layout/AppWrapper.js'
import {
  Users,
  Briefcase,
  ChevronRight,
  AlertCircle,
  Loader2,
  Link2,
  Check
} from 'lucide-react'

type EntityTab = 'candidate' | 'job' | 'recruiter' | 'application'

interface TabConfig {
  key: EntityTab
  label: string
  icon: React.ReactNode
  color: string
}

interface DetailRow {
  label: string
  value: string
}

const TABS: TabConfig[] = [
  { key: 'candidate', label: 'Candidates', icon: <Users size={14} />, color: '#a8b06b' },
  { key: 'job', label: 'Jobs', icon: <Briefcase size={14} />, color: '#7b9e6b' }
]

type Rec = Record<string, unknown>

const getPath = (record: Rec, ...keys: string[]): unknown => {
  let v: unknown = record
  for (const k of keys) {
    if (v == null || typeof v !== 'object') return undefined
    v = (v as Rec)[k]
  }
  return v
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const recordName = (record: Rec): string =>
  str(getPath(record, 'personal_details', 'full_name')) ||
  str(getPath(record, 'personal_details', 'title_or_position')) ||
  str(record.name) ||
  str(record.title) ||
  str(record.full_name) ||
  str(record.id) ||
  'Unnamed'

const recordSubtitle = (record: Rec, entityType: EntityTab): string => {
  const status = str(record.status)
  if (status) return status
  if (entityType === 'candidate') {
    return (
      str(getPath(record, 'personal_details', 'title_or_position')) ||
      str(getPath(record, 'personal_details', 'contact', 'email')) ||
      str(getPath(record, 'professional', 'summary')).slice(0, 80) ||
      ''
    )
  }
  if (entityType === 'job') {
    return [str(record.department), str(record.location), str(record.type)]
      .filter(Boolean)
      .join(' · ')
  }
  return ''
}

const joinList = (v: unknown): string => (Array.isArray(v) ? v.filter(Boolean).join(', ') : '')

// ─── Detail row builder 
const buildDetailRows = (record: Rec, entityType: EntityTab): DetailRow[] => {
  const rows: DetailRow[] = []

  if (entityType === 'candidate') {
    const pd = record.personal_details as Rec | undefined
    const pf = record.professional as Rec | undefined
    const contact = pd?.contact as Rec | undefined

    if (str(record.status)) rows.push({ label: 'Status', value: str(record.status) })
    if (pd) {
      if (str(pd.title_or_position)) rows.push({ label: 'Title', value: str(pd.title_or_position) })
      if (contact) {
        if (str(contact.email)) rows.push({ label: 'Email', value: str(contact.email) })
        if (str(contact.phone)) rows.push({ label: 'Phone', value: str(contact.phone) })
        if (str(contact.address)) rows.push({ label: 'Location', value: str(contact.address) })
      }
    }
    if (pf) {
      if (str(pf.summary)) rows.push({ label: 'Summary', value: str(pf.summary) })

      const skillParts: string[] = []
      const skillGroups = pf.skills as Rec | undefined as Rec | undefined
      if (skillGroups) {
        const skillArrays = [
          'technical',
          'soft',
          'languages',
          'frameworks_or_libraries',
          'tools_or_platforms',
          'other'
        ]
        for (const k of skillArrays) {
          const joined = joinList(skillGroups[k])
          if (joined) skillParts.push(joined)
        }
      }
      if (skillParts.length) rows.push({ label: 'Skills', value: skillParts.join(' · ') })

      const exp = Array.isArray(pf.experience) ? (pf.experience as Rec[]) : []
      if (exp.length) {
        const preview = exp
          .slice(0, 3)
          .map((e) => [str(e.title), str(e.organization)].filter(Boolean).join(' — '))
          .filter(Boolean)
          .join('; ')
        rows.push({
          label: `Experience (${exp.length})`,
          value: preview + (exp.length > 3 ? ' …' : '') || '—'
        })
      }
    }
   
    if (contact) {
      const social = [
        str(contact.linkedin),
        str(contact.github),
        str(contact.website_or_portfolio)
      ].filter(Boolean)
      if (social.length) rows.push({ label: 'Links', value: social.join(' · ') })
    }
  } else if (entityType === 'job') {
    if (str(record.department)) rows.push({ label: 'Department', value: str(record.department) })
    if (str(record.location)) rows.push({ label: 'Location', value: str(record.location) })
    if (str(record.type)) rows.push({ label: 'Type', value: str(record.type) })
    if (str(record.salaryRange)) rows.push({ label: 'Salary', value: str(record.salaryRange) })
    if (str(record.description)) rows.push({ label: 'Description', value: str(record.description) })
    const reqs = joinList(record.requirements)
    if (reqs) rows.push({ label: 'Requirements', value: reqs })
    if (typeof record.active !== 'undefined')
      rows.push({ label: 'Active', value: record.active ? 'Yes' : 'No' })
    if (str(record.postedAt)) rows.push({ label: 'Posted', value: str(record.postedAt) })
  } 

  // Fallback: surface any remaining top-level keys generically.
  
  return rows
}


export const Platform = () => {
  const [activeTab, setActiveTab] = useState<EntityTab>('candidate')
  const [searchQuery, _] = useState('')
  const [records, setRecords] = useState<Rec[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<Rec | null>(null)
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null)

  const fetchRecords = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setSelectedRecord(null)
    try {
      const result = await window.platformQuery.query({
        entityType: activeTab,
        operation: 'search',
        query: searchQuery || undefined
      })
      if (result.success) {
        const out = result.output as Rec
        let rows = (out.results as Rec[]) ?? []
        // Enrich job rows with their public application link (shown in the UI).
        if (activeTab === 'job') {
          rows = await Promise.all(
            rows.map(async (r) => {
              const id = str(r.id)
              if (!id) return r
              try {
                const link = await window.platformQuery.getJobLink(id)
                if (link.success && link.applyUrl) return { ...r, applyUrl: link.applyUrl }
              } catch {
                /* link resolution is best-effort */
              }
              return r
            })
          )
        }
        setRecords(rows)
      } else {
        setError(result.error ?? 'Failed to load records.')
        setRecords([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, searchQuery])

  // Fetch when tab changes or on mount
  useEffect(() => {
    fetchRecords()
  }, [activeTab])



  const handleCopyJobLink = async (jobId: string) => {
    const res = await window.platformQuery.copyJobLink(jobId)
    if (res.success && res.copied) {
      setCopiedJobId(jobId)
      window.setTimeout(() => setCopiedJobId((cur) => (cur === jobId ? null : cur)), 1600)
    } else {
      setError(res.error ?? 'Could not copy the job link.')
    }
  }

  const activeTabConfig = TABS.find((t) => t.key === activeTab)!

  return (
    <AppWrapper>
      <div style={{ padding: '5px' }} className="w-full h-full flex flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Entity tabs */}
          <div className="flex flex-col pt-4 gap-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="flex items-center gap-2 px-4 py-3 text-[11px] text-left transition-all cursor-pointer"
                  style={{
                    color: isActive ? tab.color : 'rgba(191,189,184,0.5)',
                    padding: '6px 12px'
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Right: Content */}
          <div style={{ padding: '5px' }} className="flex-1 flex flex-col overflow-hidden">
            {/* Main area: list + detail */}
            <div className="flex flex-1 overflow-hidden">
              {/* Record list */}
              <div className="flex flex-col overflow-y-auto scroll-box " style={{ width: '50%' }}>
                {isLoading && records.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-secondary/30 text-[11px] gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Loading {activeTabConfig.label.toLowerCase()}…
                  </div>
                )}
                {error && (
                  <div
                    className="flex items-start gap-2 m-4 p-3 rounded-md text-[11px] text-red-400/80"
                    style={{
                      background: 'rgba(239,68,68,0.07)',
                      border: '1px solid rgba(239,68,68,0.15)'
                    }}
                  >
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {!isLoading && !error && records.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center text-secondary/25 gap-2">
                    <Briefcase size={28} />
                    <p className="text-[11px]">No {activeTabConfig.label.toLowerCase()} found</p>
                  </div>
                )}
                {records.map((record, i) => (
                  <RecordRow
                    key={i}
                    record={record}
                    entityType={activeTab}
                    color={activeTabConfig.color}
                    isSelected={selectedRecord === record}
                    copied={copiedJobId === String(record.id)}
                    onCopyLink={() => handleCopyJobLink(String(record.id))}
                    onClick={() => setSelectedRecord(record === selectedRecord ? null : record)}
                  />
                ))}
              </div>

              {/* Detail panel */}
              <div style={{ padding: '8px' }} className="flex-1 scroll-box overflow-y-auto p-4">
                {selectedRecord ? (
                  <RecordDetail
                    record={selectedRecord}
                    entityType={activeTab}
                    color={activeTabConfig.color}
                    copied={copiedJobId === String(selectedRecord.id)}
                    onCopyLink={() => handleCopyJobLink(String(selectedRecord.id))}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-secondary/20 gap-2">
                    <ChevronRight size={24} />
                    <p className="text-[11px]">Select a record to view details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppWrapper>
  )
}

const RecordRow = ({
  record,
  entityType,
  color,
  isSelected,
  copied,
  onCopyLink,
  onClick
}: {
  record: Rec
  entityType: EntityTab
  color: string
  isSelected: boolean
  copied: boolean
  onCopyLink: () => void
  onClick: () => void
}) => {
  const name = recordName(record)
  const subtitle = recordSubtitle(record, entityType)
  const applyUrl = entityType === 'job' ? str(record.applyUrl) : ''

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3  transition-all cursor-pointer"
      style={{
        padding: '3px',
        background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent'
      }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
        style={{ background: `${color}22`, color }}
      >
        {String(name).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-secondary truncate">{name}</p>
        {subtitle && <p className="text-[10px] text-secondary/40 truncate">{subtitle}</p>}
        {entityType === 'job' && (
          <p className="text-[9px] text-secondary/30 truncate font-mono">
            {copied ? 'Copied!' : applyUrl || '…'}
          </p>
        )}
      </div>
      {entityType === 'job' && (
        <span
          role="button"
          title="Copy application link"
          onClick={(e) => {
            e.stopPropagation()
            onCopyLink()
          }}
          className="shrink-0 rounded-md p-1.5 transition-all"
          style={{
            color: copied ? '#8fbf6b' : 'rgba(191,189,184,0.45)',
            background: copied ? 'rgba(143,191,107,0.12)' : 'rgba(255,255,255,0.04)'
          }}
        >
          {copied ? <Check size={12} /> : <Link2 size={12} />}
        </span>
      )}
      <ChevronRight size={12} style={{ color: 'rgba(191,189,184,0.25)' }} />
    </button>
  )
}

const RecordDetail = ({
  record,
  entityType,
  color,
  copied,
  onCopyLink
}: {
  record: Rec
  entityType: EntityTab
  color: string
  copied: boolean
  onCopyLink: () => void
}) => {
  const name = recordName(record)
  const rows = buildDetailRows(record, entityType)

  return (
    <div className="flex flex-col gap-4">
      {/* Name header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-semibold shrink-0"
          style={{ background: `${color}22`, color }}
        >
          {String(name).charAt(0).toUpperCase()}
        </div>
        <p className="text-[14px] font-semibold text-secondary">{name}</p>
      </div>

      

      {/* Fields */}
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-0.5 p-2 rounded-md"
          >
            <span className="text-[9px] uppercase tracking-widest text-secondary/35">
              {row.label}
            </span>
            <span className="text-[11px] text-secondary/80 break-all">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
