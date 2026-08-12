import { ToolDescription as Tool } from "./BaseTool.js";

const microsoftWordDesc = new Tool(
  "microsoft_word",
  "USE THIS ONLY when the deliverable must be a formatted Microsoft Word (.docx) " +
    "document — e.g. an offer letter, formal job description, or a report the user " +
    "will edit/share as a Word file. Choose this over file_system when the recipient " +
    "expects a Word document. Do NOT use this for plain text/CSV/JSON files (use " +
    "file_system) and do NOT use this to store candidate or recruiter records (use " +
    "recruitment_platform_sub_agent).",
  true
);
microsoftWordDesc.addEnumProperty(
  "operation",
  ["create", "edit", "read"],
  "The Word document operation to perform.",
  true
);
microsoftWordDesc.addStringProperty("filePath", "The path of the Word document to operate on.", true);
microsoftWordDesc.addStringProperty("content", "The content to write. Required for 'create' and 'edit'. For 'create', CSV text (one record per line, comma-separated) is rendered as a formatted table.", false);
microsoftWordDesc.addStringProperty(
  "exportFormat",
  "Optional second output: export the document to another format after saving — pdf, doc, rtf, txt, html, odt, xps, xml, and more. Defaults to 'pdf' when exportPath is given. Use when the deliverable must be a PDF (or another Word-supported format).",
  false
);
microsoftWordDesc.addStringProperty(
  "exportPath",
  "Optional path for the exported file. Defaults to filePath with a new extension based on exportFormat.",
  false
);

export { microsoftWordDesc };
