import { useRef, useState, useEffect, useCallback } from 'react'
import { MoveUp, Loader2, CheckCircle2, Circle, AlertCircle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StepItem {
  id: string
  icon: string
  label: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  failureReason?: string | null
}

export interface ChatMessageItem {
  id: string
  content: string
  fromMe: boolean
  isWorking?: boolean
  workingMessage?: string
  todoList?: StepItem[]
  timestamp: Date
}

const RANDOM_WORKING_MESSAGES = [
  'Evaluating...',
  'Assessing...',
  'Reviewing...',
  'Investigating...',
  'Deliberating...',
  'Determining...',
  'Examining...',
  'Contemplating...',
  'Planning...',
  'Deciding...',
]

function getRandomWorkingMessage(): string {
  const index = Math.floor(Math.random() * RANDOM_WORKING_MESSAGES.length)
  return RANDOM_WORKING_MESSAGES[index]
}

interface ChatSessionProps {
  currentSessionId?: string
  onSessionUpdated?: (sessionId: string) => void
  onNewSession?: () => void
}

export const ChatSession = ({
  currentSessionId,
  onSessionUpdated
}: ChatSessionProps) => {
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessageItem[]>>({})
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingSession, setIsFetchingSession] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const activeSessionKey = currentSessionId || 'default'
  const messages = messagesBySession[activeSessionKey] || []

  const updateSessionMessages = (
    key: string,
    updater: (prev: ChatMessageItem[]) => ChatMessageItem[]
  ) => {
    setMessagesBySession((prev) => ({
      ...prev,
      [key]: updater(prev[key] || [])
    }))
  }

  // Fetch persisted session history 
  useEffect(() => {
    if (!currentSessionId) return

    let isMounted = true
    setIsFetchingSession(true)
    window.agent
      .getSession(currentSessionId)
      .then((res) => {
        if (!isMounted) return
        if (res.success && res.session) {
          const loadedMessages: ChatMessageItem[] = []
          const conversationLog = res.session.conversation_log
          console.log('Loaded session:', res.session)
          if (Array.isArray(conversationLog)) {
            conversationLog.forEach((turn: any, index: number) => {
              if (turn && typeof turn === 'object') {
                if (turn.user_prompt) {
                  loadedMessages.push({
                    id: `user-${turn.turn || index}-${index}`,
                    content: turn.user_prompt,
                    fromMe: true,
                    timestamp: turn.timestamp ? new Date(turn.timestamp) : new Date()
                  })
                }
                if (turn.ai_response) {
                  loadedMessages.push({
                    id: `ai-${turn.turn || index}-${index}`,
                    content: turn.ai_response,
                    fromMe: false,
                    timestamp: turn.timestamp ? new Date(turn.timestamp) : new Date()
                  })
                } else if (!turn.user_prompt && (turn.message || turn.text || turn.log)) {
                  loadedMessages.push({
                    id: `system-${index}`,
                    content: turn.message || turn.text || turn.log,
                    fromMe: false,
                    timestamp: turn.timestamp ? new Date(turn.timestamp) : new Date()
                  })
                }
              } else if (typeof turn === 'string') {
                loadedMessages.push({
                  id: `str-${index}`,
                  content: turn,
                  fromMe: false,
                  timestamp: new Date()
                })
              }
            })
          }

          setMessagesBySession((prev) => ({
            ...prev,
            [currentSessionId]: loadedMessages
          }))
        }
      })
      .catch((err) => {
        console.error('Failed to load session history:', err)
      })
      .finally(() => {
        if (isMounted) setIsFetchingSession(false)
      })

    return () => {
      isMounted = false
    }
  }, [currentSessionId])

  // Auto-scroll when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleInput = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    textarea.style.overflowY = textarea.scrollHeight > 200 ? 'auto' : 'hidden'
  }

  const isAgentActivated = Boolean(
    (localStorage.getItem('owner_email') || '').trim() &&
    (localStorage.getItem('owner_phone') || '').trim()
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && input.trim() && isAgentActivated) handleSend()
    }
  }

  const handleSend = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || isLoading || !isAgentActivated) return

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const targetKey = activeSessionKey
    const userMsgId = `user-${Date.now()}`
    const workingMsgId = `working-${Date.now()}`

   
    updateSessionMessages(targetKey, (prev) => [
      ...prev,
      { id: userMsgId, content: prompt, fromMe: true, timestamp: new Date() }
    ])

    const randomMsg = getRandomWorkingMessage()
    updateSessionMessages(targetKey, (prev) => [
      ...prev,
      {
        id: workingMsgId,
        content: '',
        fromMe: false,
        isWorking: true,
        workingMessage: randomMsg,
        todoList: [],
        timestamp: new Date()
      }
    ])

    setIsLoading(true)

    // Subscribe to live step progress
    const unsubscribe = window.agent.onProgress((event) => {
      updateSessionMessages(targetKey, (prev) =>
        prev.map((m) => {
          if (m.id !== workingMsgId) return m

          const currentList = m.todoList ?? []

          if (event.type === 'step_start') {
            const newStep: StepItem = {
              id: `step-${Date.now()}-${Math.random()}`,
              icon: event.icon ?? '⚙️',
              label: event.message,
              status: 'in_progress'
            }
            return {
              ...m,
              todoList: [...currentList, newStep]
            }
          }

          if (event.type === 'step_end') {
            const updated = [...currentList]
            if (updated.length > 0) {
              const last = updated[updated.length - 1]
              updated[updated.length - 1] = {
                ...last,
                status: event.verdict === 'pass' ? 'completed' : 'failed',
                failureReason: event.failure_reason
              }
            }
            return { ...m, todoList: updated }
          }

          if (event.type === 'log') {
            return { ...m, workingMessage: event.message }
          }

          return m
        })
      )
    })

    try {
      const result = await window.agent.run(prompt, currentSessionId)
      if (result.sessionId) {
        onSessionUpdated?.(result.sessionId)
      }

      // On complete: turn off working state, set final text, preserve todoList
      updateSessionMessages(targetKey, (prev) =>
        prev.map((m) =>
          m.id === workingMsgId ? { ...m, isWorking: false, content: result.text } : m
        )
      )
    } catch (err) {
      updateSessionMessages(targetKey, (prev) =>
        prev.map((m) =>
          m.id === workingMsgId
            ? {
                ...m,
                isWorking: false,
                content: `Error: ${err instanceof Error ? err.message : String(err)}`
              }
            : m
        )
      )
    } finally {
      unsubscribe()
      setIsLoading(false)
    }
  }, [input, isLoading, isAgentActivated, currentSessionId, activeSessionKey, onSessionUpdated])
  console.log('Messages by session--:', messages)
  return (
    <div
      style={{ padding: '15px' }}
      className="w-full h-full bg-[#1c1d04]  flex flex-col items-center relative  "
    >
      {/* Messages */}
      <div
        style={{ padding: '6px' }}
        className="flex flex-col   w-full flex-1 overflow-y-auto gap-4 pr-1 scroll-box"
      >
        {isFetchingSession ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 text-secondary/50 animate-spin" />
            <p className="text-secondary/50 text-[12px]">Loading session history...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <p className="text-secondary/50 text-[13px] font-medium">
              {currentSessionId ? 'Continuing existing session…' : 'Start a new session…'}
            </p>
            <p className="text-secondary/30 text-[11px]">Ask a question or give a task</p>
          </div>
        ) : null}
        {!isFetchingSession && messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
        <div ref={bottomRef} />
      </div>

      <div className="w-full flex justify-center mt-2">
        {!isAgentActivated ? (
          <div
            style={{ padding: '6px', marginTop: '20px' }}
            className="w-full mb-3    text-[11px] text-secondary/80 flex items-center justify-between"
          >
            <span>
              <strong>Agent Inactive:</strong> Please connect your email address and WhatsApp phone
              number in <strong>Settings</strong> to enable taking prompts.
            </span>
          </div>
        ) : (
          <div
            style={{ padding: '6px', marginBottom: '4px' }}
            className={`flex items-end w-[70%] border rounded-lg transition-all ${
              isLoading || !isAgentActivated
                ? 'opacity-50 border-yellow-500/20 bg-[#1e1f02] cursor-not-allowed'
                : 'border-white/5 bg-[#272801]'
            }`}
          >
            <textarea
              style={{ padding: '3px' }}
              placeholder={
                !isAgentActivated
                  ? 'Agent is inactive. Connect email & phone in Settings to send prompts.'
                  : isLoading
                    ? 'Agent is working... Please wait for completion.'
                    : 'Ask me something or give me a task…'
              }
              className="scroll-box flex-1 bg-transparent p-4 resize-none text-[13px] text-secondary placeholder:text-secondary/30 focus:outline-none border-none disabled:cursor-not-allowed"
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              disabled={isLoading || !isAgentActivated}
            />
            <button
              style={{ padding: '6px', marginBottom: '4px' }}
              onClick={handleSend}
              disabled={isLoading || !isAgentActivated || !input.trim()}
              className="flex-shrink-0 p-3 mb-1 bg-gray-300 text-[#323300] rounded-full disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : <MoveUp size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


const MessageBubble = ({ message }: { message: ChatMessageItem }) => {
  if (message.fromMe) {
    return (
      <div
        className="self-end text-[11px] rounded-lg max-w-[70%]"
        style={{
          padding: '8px',
          backgroundColor: '#323300',
          color: '#bfbdb8',
          alignSelf: 'flex-end'
        }}
      >
        {message.content}
      </div>
    )
  }

  return (
    <div
      className="self-start text-[11px]  max-w-[85%] flex flex-col gap-3"
      style={{
        padding: '12px',
        color: '#bfbdb8',
        alignSelf: 'flex-start'
      }}
    >
      {message.isWorking && (
        <div className="flex items-center gap-2 px-3 py-2 animate-pulse">
          <Loader2 size={11} className="animate-spin text-[#767662]" />
          <span className="font-medium text-[12px] text-[#68680b] tracking-wide">
            {message.workingMessage || 'Agent is working...'}
          </span>
        </div>
      )}


      {message.todoList && message.todoList.length > 0 && (
        <div style={{ padding: '6px' }} className="flex flex-col gap-2 ">
          <p className="text-[10px] uppercase font-semibold text-secondary/40 tracking-wider mb-1 flex items-center justify-between">
            <span>Todos </span>
            {message.isWorking && (
              <span className="text-[#5d5e40] lowercase italic">in progress</span>
            )}
          </p>
          <div className="flex flex-col gap-1.5">
            {message.todoList.map((step) => (
              <div
                style={{ padding: '6px' }}
                key={step.id}
                className={`flex items-start gap-2.5 text-[11px]   transition-colors ${
                  step.status === 'in_progress'
                    ? ' text-secondary font-medium border-l-2 border-[#ecee81]'
                    : step.status === 'completed'
                      ? 'text-secondary/70'
                      : step.status === 'failed'
                        ? 'text-red-400 '
                        : 'text-secondary/40'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {step.status === 'in_progress' && (
                    <Loader2 size={13} className="animate-spin text-[#ecee81]" />
                  )}
                  {step.status === 'completed' && (
                    <CheckCircle2 size={13} className="text-green-400" />
                  )}
                  {step.status === 'failed' && <AlertCircle size={13} className="text-red-400" />}
                  {step.status === 'pending' && <Circle size={13} className="text-secondary/30" />}
                </div>
                <div className="flex flex-col flex-1">
                  <div className="flex items-center gap-1.5">
                    <span>{step.icon}</span>
                    <span>{step.label}</span>
                  </div>
                  {step.failureReason && (
                    <span className="text-[10px] text-red-400/80 mt-0.5">{step.failureReason}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!message.isWorking && message.todoList && message.todoList.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-secondary/90 font-medium px-2 py-1 ">
          <CheckCircle2 size={12} />
          <span>Session execution finished!</span>
        </div>
      )}

      {message.content && !message.isWorking && (
        <div
          style={{ paddingTop: '3px' }}
          className="whitespace-pre-wrap leading-relaxed text-[12px] text-secondary"
        >
          {message.content}
        </div>
      )}
    </div>
  )
}
