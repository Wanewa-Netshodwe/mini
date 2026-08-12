import { ToolResult } from '../tool.Type'

export const buildResult = <T>(
  args: T & { taskId?: string; step_number?: number; tool?: string },
  success: boolean,
  output: Record<string, unknown> | string,
  error?: string
): ToolResult => {
  return {
    taskId: args.taskId ?? '',
    step_number: args.step_number ?? 0,
    tool: args.tool ?? 'n/a',
    success,
    output,
    ...(error ? { error } : {})
  }
}
