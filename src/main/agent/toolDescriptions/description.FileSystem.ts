import { ToolDescription as Tool } from "./baseTool.js";

const fileSystemToolDesc = new Tool(
  "file_system",
  "USE THIS to READ, WRITE, or DELETE a plain local file on disk — e.g. a saved " +
    "resume, a generated CSV/JSON/text report, or a temporary working file. The file " +
    "does NOT need to have been created by this system. Do NOT use this for candidate, " +
    "recruiter, job, or application records (use recruitment_platform_sub_agent). Do NOT " +
    "use this to produce a formatted .docx document (use microsoft_word instead).",
  true
);
fileSystemToolDesc.addEnumProperty(
  "operation",
  ["read", "write", "delete"],
  "The file system operation to perform.",
  true
);
fileSystemToolDesc.addStringProperty(
  "filePath",
  "The path of the file to operate on. ALWAYS use an absolute path or a '~'-prefixed " +
    "path ('~/Desktop/report.csv', 'C:/Users/main/Desktop/x.txt'). '~' expands to the " +
    "user's home directory. NEVER use a bare relative path like 'Desktop/x.txt' — it " +
    "resolves against the agent's working directory, not the user's desktop.",
  true
);
fileSystemToolDesc.addStringProperty("content", "The content to write to the file. Required when operation is 'write'.", false);

export { fileSystemToolDesc };
