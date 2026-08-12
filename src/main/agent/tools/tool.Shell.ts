import { exec } from "child_process";
import os from "os";
import type { ToolResult } from "./tool.Type.js";

type arguments = {
    taskId: string;
    step_number: number;
    tool: string;
    command: string;
    cwd?: string;
    timeoutMs?: number;
};

/** Expand ~ / ~/... to the user's home directory. cmd.exe does not expand `~`,
 *  so we do it before handing the command to the shell. Uses forward slashes so
 *  no backslash-escaping is needed inside the command string. */
const expandTilde = (value: string): string => {
    const home = os.homedir().replace(/\\/g, "/");
    return value.replace(/^~(?=[\\/]|$)|(?<=\s)~(?=[\\/]|$)/g, home);
}

/**
 * shell — run a command on the local machine and return its stdout/stderr.
 * On Windows the command runs through cmd.exe, elsewhere through /bin/sh.
 * Guarded by a timeout (default 30s) so a hung command cannot stall a task.
 */
const shellTool = async (args: arguments): Promise<ToolResult> => {
    if (!args.command || typeof args.command !== "string" || args.command.trim() === "") {
        return {
            output: "command is required (a shell command string).",
            taskId: args.taskId,
            step_number: args.step_number,
            tool: args.tool,
            success: false,
            error: "command is required (a shell command string).",
        };
    }
    const timeoutMs = args.timeoutMs && Number.isFinite(args.timeoutMs) ? args.timeoutMs : 30000;
    return await new Promise<ToolResult>((resolve) => {
        exec(
            expandTilde(args.command),
            {
                cwd: args.cwd ? expandTilde(args.cwd) : process.cwd(),
                timeout: timeoutMs,
                maxBuffer: 10 * 1024 * 1024,
                windowsHide: true,
            },
            (error, stdout, stderr) => {
                const output = {
                    command: args.command,
                    exitCode: error?.code ?? 0,
                    stdout: stdout ?? "",
                    stderr: stderr ?? "",
                };
                if (error && error.code !== 0) {
                    resolve({
                        output,
                        taskId: args.taskId,
                        step_number: args.step_number,
                        tool: args.tool,
                        success: false,
                        error:
                            error.killed && (error as { signal?: string }).signal === "SIGTERM"
                                ? `Command timed out after ${timeoutMs}ms`
                                : `Command failed with exit code ${error.code ?? "unknown"}`,
                    });
                    return;
                }
                resolve({
                    output,
                    taskId: args.taskId,
                    step_number: args.step_number,
                    tool: args.tool,
                    success: true,
                });
            }
        );
    });
};

export default shellTool;
