import { ToolDescription as Tool } from "./BaseTool.js";

const googleCalendarQueryDesc = new Tool(
  "google_calendar_query",
  "USE THIS to READ the user's Google Calendar without changing anything: list the " +
    "user's calendars (operation 'list_calendars') or list upcoming events (operation " +
    "'list_events'). Pick this tool for availability checks, timezone/capacity lookups, " +
    "or confirming whether an event already exists. Do NOT use this to create, " +
    "reschedule, or cancel events (use calendar), and do NOT use this to manage the " +
    "connection (use google_calendar_connection). Requires an active connection — check " +
    "with google_calendar_connection (operation 'status') first if you are unsure.",
  true
);
googleCalendarQueryDesc.addEnumProperty(
  "operation",
  ["list_calendars", "list_events"],
  "Which read query to perform.",
  true
);
googleCalendarQueryDesc.addIntegerProperty(
  "maxResults",
  "Maximum number of events to return (list_events only).",
  false
);

export { googleCalendarQueryDesc };
