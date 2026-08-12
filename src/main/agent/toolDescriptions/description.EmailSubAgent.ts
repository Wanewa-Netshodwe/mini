import { ToolDescription as Tool } from './BaseTool.js'

const emailSubAgentDesc = new Tool(
  'email_sub_agent',
  'USE THIS to SEND an EMAIL — to ANY recipient. Works for general requests where the ' +
    'user supplies the recipient\'s address and what to say (e.g. "email john.doe@gmail.com ' +
    'that the kickoff is Monday 9am"), as well as for notifying a platform candidate or ' +
    'recruiter (gather their address from recruitment_platform_sub_agent first). The sender ' +
    "is always the agent's own configured address — never fabricated. Choose email over " +
    'whatsapp_sub_agent when the recipient has an email address and email is the appropriate ' +
    'channel. \`instructions\` should say what the email needs to accomplish and any facts ' +
    '(from recruitment_platform_sub_agent or elsewhere) it must include.',
  true
)
emailSubAgentDesc.addStringProperty('recipient', 'The email address of the recipient.', true)
emailSubAgentDesc.addStringProperty('subject', 'The subject of the email.', true)
emailSubAgentDesc.addStringProperty('body', 'The body of the email.', true)
emailSubAgentDesc.addBooleanProperty('isHtml', 'Whether the email body is in HTML format.', false)
emailSubAgentDesc.addArrayProperty(
  'attachments',
  { type: 'string' },
  'File path(s) to attach to the email, each an absolute path or a ~-prefixed path ' +
    '(e.g. "~/Desktop/Nodejs_Candidates.csv" or { "path": "~/Desktop/report.txt", "name": "report.txt" }). ' +
    'Use when the email must carry a file the agent produced (a CSV, TXT, PDF, etc.).',
  false
)
emailSubAgentDesc.addStringProperty(
  'instructions',
  'Plain-language instructions for the sub-agent: the goal of this email and any ' +
    'facts it must reference (e.g. candidate name, interview time, job title).',
  false
)

export { emailSubAgentDesc }
