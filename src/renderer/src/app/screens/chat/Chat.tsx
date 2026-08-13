import { useState, useEffect, useCallback } from 'react'
import { AppWrapper } from '@renderer/app/layout/AppWrapper.js'
import { ChatSession } from './components/ChatSession'
import { ChatTab } from './components/ChatTab'
export interface SessionInfo {
  session_id: string
  title?: string
  status: string
}

export const Chat = () => {
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined)
  const [sessions, setSessions] = useState<SessionInfo[]>([])

  const loadSessions = useCallback(async () => {
    try {
      const res = await window.agent.getSessions()
      if (res.success && res.sessions) {
        setSessions(res.sessions)
      }
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Restore the authenticated socket connection whenever the desktop opens.
  useEffect(() => {
    const userId = localStorage.getItem('client_uuid') || localStorage.getItem('user_email')
    if (userId) window.socket.connect(userId)
  }, [])

  const handleStartNewSession = async () => {
    try {
      const res = await window.agent.newSession()
      if (res.success && res.sessionId) {
        setCurrentSessionId(res.sessionId)
        await loadSessions()
      }
    } catch (err) {
      console.error('Failed to start new session:', err)
    }
  }

  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id)
  }

  return (
    <AppWrapper>
      <div
   
      className="w-full h-full flex bg-[#2a2c01]">
        <ChatTab
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleStartNewSession}
        />
        <ChatSession
          currentSessionId={currentSessionId}
          onSessionUpdated={(newId) => {
            setCurrentSessionId(newId)
            loadSessions()
          }}
          onNewSession={handleStartNewSession}
        />
      </div>
    </AppWrapper>
  )
}

