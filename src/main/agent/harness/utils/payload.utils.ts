import { Session, Step, Task } from '../types/types.Session'
// used by the orchestrator to build the payload for a handler call and add context from previous steps
export const buildPayload = (session: Session, step: Step): Record<string, unknown> => {
  const task = session.current_task
  // Accumulate data_received from completed steps, then merge the CURRENT
  const context: Record<string, unknown> = {}
  for (const s of task.steps) {
    if (s.status === 'completed' && s.data_received) {
      Object.assign(context, s.data_received)
    }
    if (s.step_number === step.step_number) {
      if (step.data_received) Object.assign(context, step.data_received)
      break
    }
  }

  return {
    task_id: task.task_id,
    step_goal: step.goal,
    step_number: step.step_number,
    ...context,
    context,
    data_needed: step.data_needed,
    ...(step.requires_isolation ? { inherited_context: JSON.stringify(context).slice(0, 500) } : {})
  }
}
//checks if the recruitment_platform_sub_agent has been used in any previous steps of the task before the given step number
export const platformDataUsedEarlier = (task: Task, beforeStepNumber: number): boolean => {
  return task.steps.some(
    (s) =>
      s.handler === 'recruitment_platform_sub_agent' &&
      s.step_number < beforeStepNumber &&
      s.status === 'completed'
  )
}
//checks if an approval has been passed for the task before the given step number
export const approvalPassedBefore = (task: Task, beforeStepNumber: number): boolean => {
  const gate = task.steps.find(
    (s) => s.handler === 'approval_gate' && s.step_number < beforeStepNumber
  )
  return !!gate && gate.status === 'completed' && gate.verdict === 'pass'
}
