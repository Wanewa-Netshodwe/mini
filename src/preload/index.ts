import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { SocketIO } from './socketIo/io'
import { eventEmitter } from './events/emitter'
import type { AgentProgressEvent } from '../main/agent/callbacks/types/types.agent.callback'
const io = SocketIO.getInstance()

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('systemNotification', (title: string, body: string) =>
      ipcRenderer.invoke('system:notify', { title, body })
    )
    contextBridge.exposeInMainWorld('socket', {
      connect: (userId: string) => io.connect(userId),
      sendMessage: (event: string, data: unknown) => io.sendMessage(event, data)
    })
    contextBridge.exposeInMainWorld('onUpdate', (callback: (data: any) => void) => {
      eventEmitter.on('show', callback)
      return () => {
        eventEmitter.off('show', callback)
      }
    })
    contextBridge.exposeInMainWorld('onEmailSent', (callback: (data: any) => void) => {
      eventEmitter.on('emailSent', callback)
      return () => {
        eventEmitter.off('emailSent', callback)
      }
    })
    contextBridge.exposeInMainWorld('onWhatsAppMessage', (callback: (data: any) => void) => {
      eventEmitter.on('whatsappMessage', callback)
      return () => {
        eventEmitter.off('whatsappMessage', callback)
      }
    })
    contextBridge.exposeInMainWorld('windowControls', {
      minimize: () => ipcRenderer.send('window-controls:minimize'),
      maximize: () => ipcRenderer.send('window-controls:maximize'),
      unmaximize: () => ipcRenderer.send('window-controls:unmaximize'),
      close: () => ipcRenderer.send('window-controls:close')
    })
    contextBridge.exposeInMainWorld('agent', {
      run: (prompt: string, sessionId?: string) =>
        ipcRenderer.invoke('agent:run', { prompt, sessionId }),
      newSession: () => ipcRenderer.invoke('agent:newSession'),
      getSessions: () => ipcRenderer.invoke('agent:getSessions'),
      getSession: (sessionId: string) => ipcRenderer.invoke('agent:getSession', sessionId),
      onProgress: (cb: (event: AgentProgressEvent) => void) => {
        const listener = (_: Electron.IpcRendererEvent, event: AgentProgressEvent) => cb(event)
        ipcRenderer.on('agent:progress', listener)
        return () => ipcRenderer.removeListener('agent:progress', listener)
      },
      initMapping: (data: {
        agentEmail: string
        userId: string
        userEmail?: string
        userPhone?: string
        agentName?: string
      }) => ipcRenderer.invoke('agent:initMapping', data),
      getOrCreateUserId: (agentEmail: string) =>
        ipcRenderer.invoke('agent:getOrCreateUserId', agentEmail)
    })
    contextBridge.exposeInMainWorld('platformQuery', {
      query: (args: Record<string, unknown>) => ipcRenderer.invoke('platform:query', args)
    })
    contextBridge.exposeInMainWorld('calendarAuth', {
      connect: (userId: string) => ipcRenderer.invoke('calendar:connect', { userId }),
      checkStatus: (userId: string) => ipcRenderer.invoke('calendar:checkStatus', { userId }),
      disconnect: (userId: string) => ipcRenderer.invoke('calendar:disconnect', { userId }),
      getEvents: (userId: string) => ipcRenderer.invoke('calendar:getEvents', { userId }),
      createEvent: (userId: string, event: Record<string, unknown>) =>
        ipcRenderer.invoke('calendar:createEvent', { userId, event }),
      updateEvent: (userId: string, eventId: string, event: Record<string, unknown>) =>
        ipcRenderer.invoke('calendar:updateEvent', { userId, eventId, event }),
      deleteEvent: (userId: string, eventId: string) =>
        ipcRenderer.invoke('calendar:deleteEvent', { userId, eventId })
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
