import type { SessionInfo } from '../Chat'

interface ChatTabProps {
  sessions: SessionInfo[]
  currentSessionId?: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
}

export const ChatTab = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession
}: ChatTabProps) => {
  return (
    <div
      style={{ padding: '2px' ,paddingLeft: '12px'}}
      className="w-[30.3%] overflow-x-hidden  text-[11px] h-full flex flex-col gap-8"
    >
      <div
        style={{
          justifyContent: sessions.length === 0 ? 'center' : 'flex-start',
          alignItems: sessions.length === 0 ? 'center' : 'flex-start'
        }}
        className="flex flex-col  gap-2 overflow-y-auto overflow-x-hidden  flex-1 scroll-box pr-1"
      >
        {sessions.length === 0 ? (
          <div
            onClick={onNewSession}
            className="p-3 text-secondary/40 text-center cursor-pointer hover:border-white/20 transition-colors"
          >
            <p className="font-medium">No sessions found </p>
          </div>
        ) : (
          sessions.map((s) => {
            const isSelected = s.session_id === currentSessionId
            return (
              <div
                style={{ padding: '6px ' }}
                key={s.session_id}
                onClick={() => onSelectSession(s.session_id)}
                className={` rounded-md cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-[#323300]/90 text-secondary border-[#ecee81]/40 shadow-sm'
                    : 'bg-white/[0.02] hover:bg-white/[0.05] text-secondary/75 border-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate max-w-[140px]">
                      {s.title || `Session ${s.session_id.slice(-6)}`}
                    </p>
                  </div>
                  {/* <span
                    className={`text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider font-mono ${
                      s.status === 'completed'
                        ? 'bg-green-950/60 text-green-400 border border-green-500/30'
                        : s.status === 'escalated'
                          ? 'bg-red-950/60 text-red-400 border border-red-500/30'
                          : 'bg-yellow-950/60 text-yellow-400 border border-yellow-500/30'
                    }`}
                  >
                    {s.status}
                  </span> */}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
