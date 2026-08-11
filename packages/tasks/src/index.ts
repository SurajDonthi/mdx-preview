import { defineMdxPlugin } from '@mdxstudio/core';
import { TaskBoard } from './TaskBoard';

export { TaskBoard };
export type { TaskBoardProps, TaskView, TaskGroupBy, TaskMove } from './TaskBoard';

export {
  parseTaskBoard,
  flattenTasks,
  formatEstimate,
  nextStatus,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_MARKERS,
  TASK_PRIORITY_LABELS,
} from './parseTasks';
export type {
  TaskStatus,
  TaskEstimate,
  TaskLink,
  TaskFields,
  TaskRollup,
  TaskNode,
  TaskPlainLine,
  TaskItem,
  TaskDocument,
} from './parseTasks';

/**
 * Registers `<TaskBoard>` (also available as `<Tasks>`) and takes over
 * ```` ```tasks ```` fenced code blocks.
 *
 * The fence is the point of the package: a plan written as a fence is still a
 * plan an agent can read, diff and rewrite line by line, and the component is
 * only how a person looks at it.
 */
export const tasksPlugin = defineMdxPlugin({
  name: '@mdxstudio/tasks',
  components: { TaskBoard },
  aliases: { Tasks: 'TaskBoard' },
  codeFences: { tasks: 'TaskBoard' },
});
