import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    systemNotification: (title: string, body: string) => Promise<{ success: boolean }>
    socket: {
      connect: (userId: string) => void
      sendMessage: (event: string, data: any) => void
    }
    onUpdate: (callback: (data: any) => void) => any
    onEmailSent: (callback: (data: any) => void) => any
    onWhatsAppMessage: (callback: (data: any) => void) => any
    windowControls: {
      minimize: () => void
      maximize: () => void
      unmaximize: () => void
      close: () => void
    }
    agent: {
      run: (
        prompt: string,
        sessionId?: string
      ) => Promise<{ success: boolean; text: string; sessionId?: string }>
      newSession: () => Promise<{ success: boolean; sessionId?: string }>
      getSessions: () => Promise<{
        success: boolean
        sessions?: Array<{ session_id: string; title?: string; status: string }>
      }>
      getSession: (
        sessionId: string
      ) => Promise<{ success: boolean; session?: any; error?: string }>
      onProgress: (cb: (event: any) => void) => () => void
      initMapping: (data: {
        agentEmail: string
        userId: string
        userEmail?: string
        userPhone?: string
        agentName?: string
      }) => Promise<{ success: boolean; error?: string }>
      getOrCreateUserId: (
        agentEmail: string
      ) => Promise<{ success: boolean; userId: string | null; isNew: boolean; error?: string }>
    }
    calendarAuth: {
      connect: (userId: string) => Promise<{ success: boolean; userId?: string; error?: string }>
      checkStatus: (
        userId: string
      ) => Promise<{ success: boolean; authenticated: boolean; error?: string }>
      disconnect: (userId: string) => Promise<{ success: boolean; error?: string }>
      getEvents: (userId: string) => Promise<{ success: boolean; events?: any[]; error?: string }>
      createEvent: (
        userId: string,
        event: Record<string, unknown>
      ) => Promise<{ success: boolean; event?: any; error?: string }>
      updateEvent: (
        userId: string,
        eventId: string,
        event: Record<string, unknown>
      ) => Promise<{ success: boolean; event?: any; error?: string }>
      deleteEvent: (
        userId: string,
        eventId: string
      ) => Promise<{ success: boolean; error?: string }>
    }
  }
}
