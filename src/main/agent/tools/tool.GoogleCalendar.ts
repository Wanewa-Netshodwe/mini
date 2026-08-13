import type { ToolResult } from './tool.Type.js'
import { googleCalendarService } from '../services/googleCalendarService.js'
import { buildResult } from './utils/buildResult.js'

export interface CalendarToolArguments {
  taskId?: string
  step_number?: number
  tool?: string
  userId?: string
  action?: 'create' | 'reschedule' | 'cancel' | 'generate_link'
  title?: string
  description?: string
  startTime?: string
  endTime?: string
  attendees?: string[]
  location?: string
  isRemote?: boolean
  generateMeetingLink?: boolean
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const DEFAULT_USER_ID = 'default_user'

const meetConferenceData = (): Record<string, unknown> => {
  return {
    createRequest: {
      requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      conferenceSolutionKey: { type: 'hangoutsMeet' }
    }
  }
}

const extractMeetingLink = (event: object): string | null => {
  const rec = event as Record<string, unknown>
  const hangout = (rec?.hangoutLink as string) ?? null
  if (hangout) return hangout
  const conf = rec?.conferenceData as Record<string, unknown> | undefined
  const entry = Array.isArray(conf?.entryPoints)
    ? (conf.entryPoints as Record<string, unknown>[])
    : []
  const meet = entry.find((e) => String(e?.entryPointType ?? '') === 'video')
  return (meet?.uri as string) ?? null
}

// google_calendar_connection — status | connect | disconnect.

const connectionTool = async (args: CalendarToolArguments): Promise<ToolResult> => {
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

//calendar — create / reschedule / cancel events on the user's connected Google Calendar.

const calendarTool = async (args: CalendarToolArguments): Promise<ToolResult> => {
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
        attendees: args.attendees?.map((email) => ({ email })),
        ...(args.isRemote === true || args.generateMeetingLink === true
          ? { conferenceData: meetConferenceData() }
          : {})
      }
      const result = await googleCalendarService.createEvent(userId, eventData, calendarId)
      const meetingLink = extractMeetingLink(result)
      return buildResult(args, true, {
        ...(result as unknown as Record<string, unknown>),
        ...(meetingLink ? { meetingLink } : {})
      })
    }

    if (action === 'generate_link') {
      const meetingId =
        args.meetingId || args.eventId || (args.rescheduleDetails?.meetingId as string)

      if (!meetingId) {
        return buildResult(
          args,
          false,
          {},
          'meetingId/eventId is required to generate a meeting link'
        )
      }

      const patchData = {
        conferenceData: meetConferenceData()
      }

      const result = await googleCalendarService.patchEvent(
        userId,
        meetingId,
        patchData,
        calendarId
      )
      const meetingLink = extractMeetingLink(result)
      if (!meetingLink) {
        return buildResult(
          args,
          true,
          {
            ...(result as unknown as Record<string, unknown>),
            eventId: meetingId
          },
          'Event patched but no Google Meet link was returned; the account may not have Meet enabled.'
        )
      }
      return buildResult(args, true, {
        ...(result as unknown as Record<string, unknown>),
        eventId: meetingId,
        meetingLink
      })
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
        ...(args.description ? { description: args.description } : {}),
        ...(args.location ? { location: args.location } : {}),
        ...(args.isRemote === true || args.generateMeetingLink === true
          ? { conferenceData: meetConferenceData() }
          : {})
      }

      const result = await googleCalendarService.patchEvent(
        userId,
        meetingId,
        patchData,
        calendarId
      )
      const meetingLink = extractMeetingLink(result)
      return buildResult(args, true, {
        ...(result as unknown as Record<string, unknown>),
        ...(meetingLink ? { meetingLink } : {})
      })
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

//google_calendar_query — list_calendars | list_events. Read-only.
const queryTool = async (args: CalendarToolArguments): Promise<ToolResult> => {
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

export { connectionTool, calendarTool, queryTool }
