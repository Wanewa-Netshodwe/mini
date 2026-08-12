export type ToolResult={
 taskId:string,
 step_number:number,
 tool:string,
 success:boolean,
 output:Record<string,any>|string
 error?:string
}