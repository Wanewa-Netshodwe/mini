import { ToolDescription as Tool } from './BaseTool.js'

const calendarToolDesc = new Tool(
  'calendar',
  "USE THIS to CREATE, RESCHEDULE, or CANCEL an event on the user's Google Calendar — " +
    'a write/change action. Do NOT use this just to READ the calendar (use ' +
    'google_calendar_query for checking availability or listing events). Do NOT use ' +
    'this to manage the OAuth connection itself (use google_calendar_connection). ' +
    "Requires the user's Google account to be CONNECTED: first run google_calendar_connection " +
    "with operation 'status' and only proceed when it returns connected:true; if not " +
    'connected, do not fabricate a workaround — stop and have the user authorize via the ' +
    "URL returned by google_calendar_connection (operation 'connect'). Set `action` to say " +
    'which of the three this call is for. Only include `rescheduleDetails` when action is ' +
    "'reschedule', and only include `cancelDetails` when action is 'cancel' — omit both " +
    'when creating a new event.',
  true
)
calendarToolDesc.addEnumProperty(
  'action',
  ['create', 'reschedule', 'cancel'],
  'Which calendar operation this call performs.',
  true
)
calendarToolDesc.addStringProperty('title', 'The title of the event.', true)
calendarToolDesc.addStringProperty('description', 'The description of the event.', false)
calendarToolDesc.addStringProperty(
  'startTime',
  'The start time of the event in ISO 8601 format.',
  true
)
calendarToolDesc.addStringProperty('endTime', 'The end time of the event in ISO 8601 format.', true)
calendarToolDesc.addArrayProperty(
  'attendees',
  { type: 'string' },
  'Email addresses of everyone who should be invited (e.g. the candidate and the interviewer).',
  false
)
calendarToolDesc.addStringProperty(
  'location',
  'The physical location of the event, if not remote.',
  false
)
calendarToolDesc.addBooleanProperty(
  'isRemote',
  'Whether the event is a remote/video call rather than in-person.',
  true
)
calendarToolDesc.addStringProperty(
  'meetingLink',
  'The video call link, required when isRemote is true.',
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
  [],
  "Only present when action is 'reschedule'. Carries the new time and the reason for the change.",
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
      },
      meetingId: {
        type: 'string',
        description: 'The unique identifier of the event being canceled.'
      }
    }
  },
  [],
  "Only present when action is 'cancel'. Identifies which event to cancel and why.",
  false
)

export { calendarToolDesc }
