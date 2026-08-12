import fs from 'fs/promises'
import path from 'path'
import type { ToolResult } from './tool.Type.js'
import { resolveLocalPath } from './utils/pathResolver.js'
type arguments = {
  taskId: string
  step_number: number
  tool: string
  filePath: string
  operation: 'read' | 'write' | 'delete'
  content?: string
}

const fileSystemTool = async (args: arguments): Promise<ToolResult> => {
  if (!args.filePath || typeof args.filePath !== 'string') {
    return {
      output: 'filePath is required (an absolute path or a ~/... path).',
      taskId: args.taskId,
      step_number: args.step_number,
      tool: args.tool,
      success: false,
      error: 'filePath is required (an absolute path or a ~/... path).'
    }
  }
  const filePath = resolveLocalPath(args.filePath)
  try {
    switch (args.operation) {
      case 'read':
        return {
          output: await fs.readFile(filePath, 'utf-8'),
          taskId: args.taskId,
          step_number: args.step_number,
          tool: args.tool,
          success: true
        }
      case 'write':
        if (!args.content) {
          throw new Error('Content is required for write operation')
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, args.content, 'utf-8')
        return {
          output: `File written to ${filePath}`,
          taskId: args.taskId,
          step_number: args.step_number,
          tool: args.tool,
          success: true
        }
      case 'delete':
        await fs.unlink(filePath)
        return {
          output: `File deleted from ${filePath}`,
          taskId: args.taskId,
          step_number: args.step_number,
          tool: args.tool,
          success: true
        }
    }
  } catch (e) {
    return {
      output: `Error during ${args.operation} operation on ${filePath}`,
      taskId: args.taskId,
      step_number: args.step_number,
      tool: args.tool,
      success: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
export default fileSystemTool
