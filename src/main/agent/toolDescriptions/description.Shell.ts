import { ToolDescription as Tool } from "./baseTool.js";

const shellDesc = new Tool(
  "shell",
  "USE THIS to run a shell command on the local machine when the required work " +
    "cannot be done with the other tools — e.g. installing a package, running a " +
    "script, checking processes/services, listing directories, or invoking a CLI " +
    "tool. On Windows the command runs through cmd.exe, elsewhere through /bin/sh. " +
    "Prefer a dedicated tool when one exists: use file_system for reading/writing " +
    "files, microsoft_word for .docx documents, and recruitment_platform_sub_agent " +
    "and recruitment_platform_sub_agent for platform data. Keep commands simple and " +
    "idempotent; the command times out after 30 seconds by default.",
  true
);
shellDesc.addStringProperty(
  "command",
  "The shell command to run, e.g. 'npm ls -g --depth=0' or 'ls ~/Desktop'. Use the " +
    "quoting rules of the target shell (cmd.exe on Windows, /bin/sh elsewhere).",
  true
);
shellDesc.addStringProperty(
  "cwd",
  "Optional working directory for the command. If omitted, runs in the agent's " +
    "current working directory.",
  false
);
shellDesc.addIntegerProperty(
  "timeoutMs",
  "Optional timeout in milliseconds (default 30000). Use a larger value for " +
    "commands known to be slow.",
  false
);

export { shellDesc };
