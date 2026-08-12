import { ToolDescription as Tool } from './baseTool.js'

const whatsappSubAgentDes = new Tool(
  'whatsapp_sub_agent',
  'USE THIS to SEND a WHATSAPP message to ANY recipient. Works for general requests where ' +
    'the user supplies the phone number and what to say (e.g. "WhatsApp 0821234567 that the ' +
    'meeting is at 3pm"), as well as for notifying a platform candidate or recruiter (gather ' +
    'their number from recruitment_platform_sub_agent first). The number is resolved to a ' +
    'WhatsApp JID automatically with a South Africa (+27) country code. Choose this over ' +
    'email_sub_agent when the user asked for WhatsApp or when the recipient has a phone ' +
    'number but no known email. `instructions` should say what the message needs to ' +
    'accomplish and any facts it must include.',
  true
)
whatsappSubAgentDes.addStringProperty(
  'recipient',
  "The recipient's phone number — any common format is accepted (e.g. 0821234567, +27821234567, 27821234567); a South Africa (+27) JID is built automatically.",
  true
)
whatsappSubAgentDes.addStringProperty('message', 'The message to send.', true)
whatsappSubAgentDes.addArrayProperty(
  'attachments',
  { type: 'string' },
  'File path(s) to send as document message(s) after the text, each an absolute path or a ' +
    '~-prefixed path (e.g. "~/Desktop/report.txt" or { "path": "~/Desktop/report.txt", "name": "report.txt" }). ' +
    'Use when the WhatsApp message must carry a file the agent produced.',
  false
)
whatsappSubAgentDes.addStringProperty(
  'instructions',
  'Plain-language instructions for the sub-agent: the goal of this message and any ' +
    'facts it must include (e.g. candidate name, interview time, job title).',
  false
)

export { whatsappSubAgentDes }
