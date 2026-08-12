import { google, calendar_v3 } from 'googleapis'
import { CalendarAuthInstance } from '../auth/calendarAuth.js'

export class GoogleCalendarService {
  private static instance: GoogleCalendarService | null = null

  public static getInstance(): GoogleCalendarService {
    if (!GoogleCalendarService.instance) {
      GoogleCalendarService.instance = new GoogleCalendarService()
    }
    return GoogleCalendarService.instance
  }

  private async getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
    const oauth = await CalendarAuthInstance.getAuthedClient(userId)
    return google.calendar({ version: 'v3', auth: oauth })
  }

  public async isAuthenticated(userId: string): Promise<boolean> {
    return CalendarAuthInstance.isAuthenticated(userId)
  }

  public async disconnect(userId: string): Promise<void> {
    await CalendarAuthInstance.disconnect(userId)
  }

  public async listCalendars(userId: string) {
    const calendar = await this.getCalendarClient(userId)
    const { data } = await calendar.calendarList.list()
    return { calendars: data.items ?? [] }
  }

  public async listEvents(
    userId: string,
    options?: {
      calendarId?: string
      timeMin?: string
      timeMax?: string
      maxResults?: number
    }
  ) {
    const calendar = await this.getCalendarClient(userId)
    const { data } = await calendar.events.list({
      calendarId: options?.calendarId || 'primary',
      timeMin: options?.timeMin,
      timeMax: options?.timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: options?.maxResults || 100
    })
    return { items: data.items ?? [] }
  }

  public async getEvent(userId: string, eventId: string, calendarId: string = 'primary') {
    const calendar = await this.getCalendarClient(userId)
    const { data } = await calendar.events.get({
      calendarId,
      eventId
    })
    return data
  }

  public async createEvent(
    userId: string,
    event: calendar_v3.Schema$Event,
    calendarId: string = 'primary'
  ) {
    if (!event?.summary) {
      throw new Error('Event summary is required')
    }
    const calendar = await this.getCalendarClient(userId)
    const { data } = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      requestBody: event
    })
    return data
  }

  public async updateEvent(
    userId: string,
    eventId: string,
    event: calendar_v3.Schema$Event,
    calendarId: string = 'primary'
  ) {
    const calendar = await this.getCalendarClient(userId)
    const { data } = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event
    })
    return data
  }

  public async patchEvent(
    userId: string,
    eventId: string,
    event: calendar_v3.Schema$Event,
    calendarId: string = 'primary'
  ) {
    const calendar = await this.getCalendarClient(userId)
    const { data } = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: event
    })
    return data
  }

  public async deleteEvent(userId: string, eventId: string, calendarId: string = 'primary') {
    const calendar = await this.getCalendarClient(userId)
    await calendar.events.delete({
      calendarId,
      eventId
    })
    return { deleted: true, eventId }
  }
}

export const googleCalendarService = GoogleCalendarService.getInstance()
