import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AgentMappingData, getOrCreateUserId, initAgentMapping } from './agent/auth/agentMapping'
import { AgentProgressEvent } from './agent/callbacks/types/types.agent.callback'
import { runAgent } from './agent/agent'
import {
  createNewSession,
  getAllSessions,
  getSession,
  initSessions
} from './agent/utils/agent.utils'
import {
  PlatformToolArguments,
  recruitmentPlatformSubAgent
} from './agent/tools/tool.RecruitmentPlatform'
import { CalendarAuthInstance } from './agent/auth/calendarAuth'
import { googleCalendarService } from './agent/services/googleCalendarService'

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled promise rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err)
})

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    minWidth: 900,
    minHeight: 670,
    autoHideMenuBar: true,
    maximizable: false,
    maxWidth: 900,
    maxHeight: 670,
    minimizable: false,
    titleBarStyle: 'hidden',

    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  await initSessions()
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

//Agent IPC handlers

ipcMain.handle(
  'agent:run',
  async (event, { prompt, sessionId }: { prompt: string; sessionId?: string }) => {
    console.log('\n[AGENT:RUN] ─────────────────────────────────────────')
    console.log(`[AGENT:RUN] Prompt    : "${prompt}"`)
    console.log(`[AGENT:RUN] Session ID: ${sessionId ?? '(none — new session)'}`)
    try {
      const result = await runAgent(prompt, sessionId, (progress: AgentProgressEvent) => {
        // Stream each step update to the renderer while the agent is running
        if (!event.sender.isDestroyed()) {
          event.sender.send('agent:progress', progress)
        }
      })
      console.log(
        `[AGENT:RUN] Completed | Session: ${result.sessionId} | Turns: ${result.session?.conversation_log?.length ?? 0}`
      )
      console.log('[AGENT:RUN] ─────────────────────────────────────────\n')
      return { success: true, text: result.text, sessionId: result.sessionId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[IPC agent:run] Error:', msg)
      return { success: false, text: `Agent error: ${msg}` }
    }
  }
)

ipcMain.handle('agent:newSession', async () => {
  try {
    const sessionId = createNewSession()
    console.log(`[AGENT:NEW_SESSION] Created session: ${sessionId}`)
    return { success: true, sessionId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

ipcMain.handle('agent:getSessions', async () => {
  try {
    const sessions = getAllSessions()
    console.log(`[AGENT:GET_SESSIONS] Active sessions: ${sessions.length}`)
    sessions.forEach((s) => console.log(`  → ${s.session_id} [${s.status}] "${s.title}"`))
    return { success: true, sessions }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

ipcMain.handle('agent:getSession', async (_event, sessionId: string) => {
  try {
    const session = getSession(sessionId)
    if (!session) return { success: false, error: 'Session not found' }
    return { success: true, session }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

ipcMain.handle('agent:initMapping', async (_event, data: AgentMappingData) => {
  try {
    const res = await initAgentMapping(data)
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

ipcMain.handle('agent:getOrCreateUserId', async (_event, agentEmail: string) => {
  try {
    const res = await getOrCreateUserId(agentEmail)
    return { success: true, ...res }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg, userId: null, isNew: false }
  }
})

ipcMain.handle('platform:query', async (_event, args: PlatformToolArguments) => {
  try {
    const result = await recruitmentPlatformSubAgent(args)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[IPC platform:query] Error:', msg)
    return { success: false, output: {}, error: msg }
  }
})

//calendar IPC handlers
ipcMain.handle('calendar:connect', async (event, { userId }: { userId: string }) => {
  return new Promise((resolve) => {
    try {
      const { url } = CalendarAuthInstance.generateAuthUrl(userId)

      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        parent: parentWindow || undefined,
        modal: true,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      authWindow.loadURL(url)

      let handled = false

      const handleRedirect = (targetUrl: string) => {
        let parsedUrl: URL
        try {
          parsedUrl = new URL(targetUrl)
        } catch {
          return // not a valid URL, skip
        }
        const code = parsedUrl.searchParams.get('code')
        const state = parsedUrl.searchParams.get('state')

        if (code && state && !handled) {
          handled = true
          if (!authWindow.isDestroyed()) authWindow.destroy()
          CalendarAuthInstance.handleCallback(code, state)
            .then((authenticatedUserId) => {
              resolve({ success: true, userId: authenticatedUserId })
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err)
              console.error('[CalendarAuth] handleCallback error:', msg)
              resolve({ success: false, error: msg })
            })
        }
      }

      authWindow.webContents.on('will-navigate', (_e, navUrl) => {
        handleRedirect(navUrl)
      })

      authWindow.webContents.on('will-redirect', (_e, navUrl) => {
        handleRedirect(navUrl)
      })

      authWindow.webContents.on('did-start-navigation', (_e, navUrl) => {
        handleRedirect(navUrl)
      })

      authWindow.webContents.on(
        'did-fail-load',
        (_e, _errorCode, _errorDescription, validatedURL) => {
          handleRedirect(validatedURL)
        }
      )

      authWindow.on('closed', () => {
        if (!handled) {
          handled = true
          resolve({ success: false, error: 'Authentication window was closed by the user.' })
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[IPC calendar:connect] Error:', msg)
      resolve({ success: false, error: msg })
    }
  })
})

ipcMain.handle('calendar:checkStatus', async (_event, { userId }: { userId: string }) => {
  try {
    const authenticated = await CalendarAuthInstance.isAuthenticated(userId)
    return { success: true, authenticated }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, authenticated: false, error: msg }
  }
})

ipcMain.handle('calendar:disconnect', async (_event, { userId }: { userId: string }) => {
  try {
    await CalendarAuthInstance.disconnect(userId)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

ipcMain.handle('calendar:getEvents', async (_event, { userId }: { userId: string }) => {
  try {
    const res = await googleCalendarService.listEvents(userId)
    return { success: true, events: res.items }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, events: [], error: msg }
  }
})

ipcMain.handle(
  'calendar:createEvent',
  async (_event, { userId, event }: { userId: string; event: any }) => {
    try {
      const created = await googleCalendarService.createEvent(userId, event)
      return { success: true, event: created }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
)

ipcMain.handle(
  'calendar:updateEvent',
  async (_event, { userId, eventId, event }: { userId: string; eventId: string; event: any }) => {
    try {
      const updated = await googleCalendarService.patchEvent(userId, eventId, event)
      return { success: true, event: updated }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
)

ipcMain.handle(
  'calendar:deleteEvent',
  async (_event, { userId, eventId }: { userId: string; eventId: string }) => {
    try {
      await googleCalendarService.deleteEvent(userId, eventId)
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
)

ipcMain.on('window-controls:minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  console.log('minimize event received')
  if (window) {
    window.minimize()
  }
})

ipcMain.on('window-controls:maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  console.log('maximize event received')
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  }
})

ipcMain.on('window-controls:unmaximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  console.log('unmaximize event received')
  if (window) {
    window.unmaximize()
  }
})

ipcMain.on('window-controls:close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  console.log('close event received')
  if (window) {
    window.close()
  }
})
