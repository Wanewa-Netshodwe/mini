import type { ToolResult } from './tool.Type.js'
import { googleCalendarService } from '../services/googleCalendarService.js'
import { buildResult } from './utils/buildResult.js'

export interface CalendarToolArguments {
  taskId?: string
  step_number?: number
  tool?: string
  userId?: string
  action?: 'create' | 'reschedule' | 'cancel'
  title?: string
  description?: string
  startTime?: string
  endTime?: string
  attendees?: string[]
  location?: string
  isRemote?: boolean
  meetingLink?: string
  meetingId?: string
  eventId?: string
  rescheduleDetails?: Record<string, unknown>
  cancelDetails?: Record<string, unknown>
  operation?: string
  maxResults?: number
  timeMin?: string
  timeMax?: string
  calendarId?: string
  [key: string]: unknown
}

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err)
}

const DEFAULT_USER_ID = 'default_user'

//tool that will be used to check the connection status of the Google Calendar sub-agent tool
export const connectionTool = async (args: CalendarToolArguments): Promise<ToolResult> => {
  const userId = args.userId ?? DEFAULT_USER_ID
  const operation = (args.operation as string | undefined) ?? 'status'
  try {
    if (operation === 'disconnect') {
      await googleCalendarService.disconnect(userId)
      return buildResult(args, true, { connected: false, userId })
    }
    const connected = await googleCalendarService.isAuthenticated(userId)
    return buildResult(args, true, { connected, userId })
  } catch (err) {
    return buildResult(args, false, {}, errorMessage(err))
  }
}

//calendar sub-agent tool that will be used to create, reschedule, or cancel a meeting
export const calendarTool = async (args: CalendarToolArguments): Promise<ToolResult> => {
  const userId = args.userId ?? DEFAULT_USER_ID
  const action = args.action
  const calendarId = args.calendarId || 'primary'

  try {
    if (action === 'create') {
      const tzArg = typeof args.timeZone === 'string' ? args.timeZone : undefined
      const sysTz: string =
        tzArg || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg'
      const formatTime = (
        timeStr?: string
      ): { dateTime: string; timeZone?: string } | undefined => {
        if (!timeStr) return undefined
        if (!timeStr.includes('Z') && !timeStr.includes('+')) {
          return { dateTime: timeStr, timeZone: sysTz }
        }
        return { dateTime: timeStr, ...(tzArg ? { timeZone: tzArg } : {}) }
      }

      const eventData = {
        summary: args.title || 'New Meeting',
        description: args.description,
        location: args.location,
        start: formatTime(args.startTime),
        end: formatTime(args.endTime),
        attendees: args.attendees?.map((email) => ({ email }))
      }
      const result = await googleCalendarService.createEvent(userId, eventData, calendarId)
      return buildResult(args, true, result as unknown as Record<string, unknown>)
    }

    if (action === 'reschedule') {
      const meetingId =
        args.meetingId || args.eventId || (args.rescheduleDetails?.meetingId as string)

      if (!meetingId) {
        return buildResult(args, false, {}, 'meetingId/eventId is required for reschedule')
      }

      const patchData = {
        ...(args.startTime ? { start: { dateTime: args.startTime } } : {}),
        ...(args.endTime ? { end: { dateTime: args.endTime } } : {}),
        ...(args.title ? { summary: args.title } : {}),
        ...(args.description ? { description: args.description } : {})
      }

      const result = await googleCalendarService.patchEvent(
        userId,
        meetingId,
        patchData,
        calendarId
      )
      return buildResult(args, true, result as unknown as Record<string, unknown>)
    }

    if (action === 'cancel') {
      const meetingId = args.meetingId || args.eventId || (args.cancelDetails?.meetingId as string)

      if (!meetingId) {
        return buildResult(args, false, {}, 'meetingId/eventId is required for cancellation')
      }

      const result = await googleCalendarService.deleteEvent(userId, meetingId, calendarId)
      return buildResult(args, true, result)
    }

    return buildResult(args, false, {}, `Unsupported action: ${action}`)
  } catch (err) {
    return buildResult(args, false, {}, errorMessage(err))
  }
}

//calendar sub-agent tool that will be used to query events or calendars
export async function queryTool(args: CalendarToolArguments): Promise<ToolResult> {
  const userId = args.userId ?? DEFAULT_USER_ID
  const operation = (args.operation as string | undefined) ?? 'list_events'

  try {
    if (operation === 'list_calendars') {
      const result = await googleCalendarService.listCalendars(userId)
      return buildResult(args, true, result)
    }

    const result = await googleCalendarService.listEvents(userId, {
      calendarId: args.calendarId || 'primary',
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      maxResults: Number(args.maxResults) || 10
    })
    return buildResult(args, true, result)
  } catch (err) {
    return buildResult(args, false, {}, errorMessage(err))
  }
}
