import { ToolDescription as Tool } from './baseTool.js'

const calendarToolDesc = new Tool(
  'calendar',
  "USE THIS to CREATE, RESCHEDULE, or CANCEL an event on the user's Google Calendar — " +
    'a write/change action, and to GENERATE the video meeting link for a remote event. ' +
    'Do NOT use this just to READ the calendar (use ' +
    'google_calendar_query for checking availability or listing events). Do NOT use ' +
    'this to manage the OAuth connection itself (use google_calendar_connection). ' +
    "Requires the user's Google account to be CONNECTED: first run google_calendar_connection " +
    "with operation 'status' and only proceed when it returns connected:true; if not " +
    'connected, do not fabricate a workaround — stop and have the user authorize via the ' +
    "URL returned by google_calendar_connection (operation 'connect'). Set `action` to say " +
    'which of the four this call is for. Field requirements differ per action: ' +
    "'create' needs title, startTime, endTime (and timeZone); " +
    "'reschedule' needs eventId + rescheduleDetails; " +
    "'cancel' needs eventId + cancelDetails; " +
    "'generate_link' needs only eventId (and optionally generateMeetingLink). " +
    'ONLY include `rescheduleDetails` when action is ' +
    "'reschedule', and ONLY include `cancelDetails` when action is 'cancel' — omit both " +
    'when creating a new event or generating a link.',
  true
)
calendarToolDesc.addEnumProperty(
  'action',
  ['create', 'reschedule', 'cancel', 'generate_link'],
  'Which calendar operation this call performs.',
  true
)
calendarToolDesc.addStringProperty(
  'eventId',
  'The unique identifier of an EXISTING Calendar event. REQUIRED when action is ' +
    "'reschedule', 'cancel', or 'generate_link'. Omit when action is 'create' " +
    '(the event does not exist yet — the tool returns a new eventId in the result). ' +
    'Never invent this value; it must come from a prior create response or from ' +
    'google_calendar_query.',
  false
)
calendarToolDesc.addStringProperty(
  'title',
  "The title of the event. REQUIRED when action is 'create'. Not used for reschedule, " +
    'cancel, or generate_link — the tool looks up the existing event by eventId.',
  false
)
calendarToolDesc.addStringProperty('description', 'The description of the event.', false)
calendarToolDesc.addStringProperty(
  'startTime',
  "The start time of the event in ISO 8601 format. REQUIRED when action is 'create'. " +
    "For 'reschedule', put the new time in rescheduleDetails.newStartTime instead.",
  false
)
calendarToolDesc.addStringProperty(
  'endTime',
  "The end time of the event in ISO 8601 format. REQUIRED when action is 'create'. " +
    "For 'reschedule', put the new time in rescheduleDetails.newEndTime instead.",
  false
)
calendarToolDesc.addStringProperty(
  'timeZone',
  'IANA time zone (e.g. "Africa/Johannesburg") the startTime/endTime should be interpreted ' +
    'in. Strongly recommended for create/reschedule so invites render the right local time ' +
    'for every attendee.',
  false
)
calendarToolDesc.addArrayProperty(
  'attendees',
  { type: 'string' },
  'Email addresses of everyone who should be invited (e.g. the candidate and the interviewer). ' +
    "Used on 'create'; can also be supplied on 'reschedule' to update the attendee list.",
  false
)
calendarToolDesc.addStringProperty(
  'location',
  'The physical location of the event, if not remote.',
  false
)
calendarToolDesc.addBooleanProperty(
  'isRemote',
  "Only relevant when action is 'create'. Whether the event is a remote/video call rather " +
    'than in-person. When true, a Google Meet link is generated automatically by the ' +
    'Calendar API and returned in the result as `meetingLink`. Do NOT try to invent or ' +
    'require a pre-existing meeting link.',
  true
)
calendarToolDesc.addBooleanProperty(
  'generateMeetingLink',
  'Set true to generate (or attach) a Google Meet link. For new events, prefer isRemote: ' +
    'true on create instead of this flag. Use this flag with action "generate_link" and an ' +
    'eventId to add a Meet link to an event that was created without one.',
  false
)
calendarToolDesc.addStringProperty(
  'meetingLink',
  'The video call link. This is RETURNED by the tool when a Meet link is generated — you ' +
    'must not supply it yourself for remote events.',
  false
)
calendarToolDesc.addStringProperty(
  'calendarId',
  'Which calendar to act on, if the account has more than one (e.g. a shared recruitment ' +
    'calendar vs the user\'s primary). Defaults to "primary" when omitted.',
  false
)
calendarToolDesc.addEnumProperty(
  'sendUpdates',
  ['all', 'externalOnly', 'none'],
  'Who receives an email notification for this change. "all" notifies every attendee ' +
    '(default for create/reschedule/cancel), "externalOnly" notifies only attendees outside ' +
    'the organizer\'s domain, "none" sends nothing. Use "none" only if the user explicitly ' +
    'asks not to notify anyone.',
  false
)
calendarToolDesc.addObjectProperty(
  'rescheduleDetails',
  {
    type: 'object',
    properties: {
      rescheduleReason: { type: 'string', description: 'Why the event is being rescheduled.' },
      newStartTime: { type: 'string', description: 'The new start time in ISO 8601 format.' },
      newEndTime: { type: 'string', description: 'The new end time in ISO 8601 format.' }
    }
  },
  ['newStartTime', 'newEndTime'],
  "Only present when action is 'reschedule'. Carries the new time and the reason for the " +
    'change. The event being moved is identified by the top-level `eventId`, not by anything ' +
    'in here.',
  false
)
calendarToolDesc.addObjectProperty(
  'cancelDetails',
  {
    type: 'object',
    properties: {
      cancelReason: { type: 'string', description: 'Why the event is being canceled.' },
      cancelTime: {
        type: 'string',
        description: 'When the cancellation was made, in ISO 8601 format.'
      }
    }
  },
  [],
  "Only present when action is 'cancel'. The event being canceled is identified by the " +
    'top-level `eventId`, not by anything in here.',
  false
)

export { calendarToolDesc }
