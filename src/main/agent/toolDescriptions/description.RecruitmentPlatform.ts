import { ToolDescription as Tool } from "./BaseTool.js";

const recruitmentPlatformSubAgentDesc = new Tool(
  "recruitment_platform_sub_agent",
  "USE THIS for ALL questions and changes about people and jobs in the recruitment " +
    "system — candidate details (contact info, resume/application, pipeline stage, " +
    "interview history, notes), recruiter details (profile, contact info, assigned " +
    "candidates/jobs, workload), jobs, and applications. This tool talks to the " +
    "recruitment platform REST API (Bearer token) and is the ONLY source of truth for " +
    "that data — never guess or fabricate it. " +
    "The agent operates under the recruiter role: full read/write/create on candidates, " +
    "jobs, and applications it is assigned to, and read access to the rest. HIGH-IMPACT " +
    "actions (operation 'delete', or 'update' that reassigns via assignedRecruiterId) " +
    "MUST be preceded by a human-approved approval_gate step in the same plan — never " +
    "bypass it. Decide the route first: know the record id → operation 'get'; searching " +
    "by criteria → 'search'; changing fields → 'update'; adding a record → 'create'; " +
    "removing a record → 'delete' (needs approval_gate); appending a note without " +
    "touching structured fields → 'add_note'. Set `entityType` to say which kind of " +
    "record this call concerns.",
  true
);
recruitmentPlatformSubAgentDesc.addEnumProperty(
  "entityType",
  ["candidate", "recruiter", "job", "application"],
  "Which kind of platform record this call concerns.",
  true
);
recruitmentPlatformSubAgentDesc.addEnumProperty(
  "operation",
  ["get", "search", "update", "create", "delete", "add_note"],
  "The operation to perform: 'get' fetches one known record, 'search' finds records " +
    "matching criteria, 'update' changes fields on an existing record, 'create' adds a " +
    "new record, 'delete' removes a record (requires a prior approved approval_gate " +
    "step under the recruiter role), 'add_note' appends a note without changing " +
    "structured fields.",
  true
);
recruitmentPlatformSubAgentDesc.addStringProperty(
  "entityId",
  "The unique identifier of the candidate/recruiter/job/application, if already known.",
  false
);
recruitmentPlatformSubAgentDesc.addStringProperty(
  "query",
  "Free-text search terms for operation 'search' (e.g. skills, role title, location).",
  false
);
recruitmentPlatformSubAgentDesc.addStringProperty(
  "entityName",
  "The name to search/look up by, if entityId is not known (e.g. the candidate's name).",
  false
);
recruitmentPlatformSubAgentDesc.addArrayProperty(
  "fieldsRequested",
  { type: "string" },
  "Which fields the caller needs returned, e.g. [\"email\", \"phone\", \"status\"]. " +
    "Required for 'get' and 'search' operations.",
  false
);
recruitmentPlatformSubAgentDesc.addObjectProperty(
  "updates",
  {
    type: "object",
    properties: {
      status: { type: "string", description: "New pipeline status/stage (e.g. 'interviewing', 'rejected', 'hired')." },
      note: { type: "string", description: "A note to add to the record." },
      assignedRecruiterId: { type: "string", description: "Recruiter to assign this candidate/job to." },
      jobId: { type: "string", description: "Job this record should be linked to." }
    }
  },
  [],
  "Fields to change. Required when operation is 'update', 'create', or 'add_note'.",
  false
);
recruitmentPlatformSubAgentDesc.addStringProperty(
  "instructions",
  "Plain-language instructions telling the sub-agent exactly what to look up and/or " +
    "change, and what to return (e.g. \"Find candidate Jason, set his status to " +
    "'interviewing', and return his email address.\").",
  true
);
// recruitmentPlatformSubAgentDesc.addStringProperty(
//   "platformName",
//   "Optional — name of an EXTERNAL recruitment platform (e.g. LinkedIn, Indeed) if this " +
//     "call targets an external platform instead of the internal database. Omit for " +
//     "internal candidate/recruiter/job/application operations.",
//   false
// );

export { recruitmentPlatformSubAgentDesc };
