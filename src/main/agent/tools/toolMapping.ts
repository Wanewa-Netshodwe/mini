import fileSystem from './tool.FileSystem.js'
import { calendarTool, connectionTool, queryTool } from './tool.GoogleCalendar.js'
import { recruitmentPlatformSubAgent } from './tool.RecruitmentPlatform.js'

const toolMapping: Record<string, Function> = {
  fileSystem,
  calendar: calendarTool,
  google_calendar_connection: connectionTool,
  google_calendar_query: queryTool,
  recruitment_platform_sub_agent: recruitmentPlatformSubAgent
}
export default toolMapping
