import { defineMdxPlugin } from '@mdxstudio/core';

import { TaskBoard } from './TaskBoard';

export { TaskBoard };
export type { TaskBoardProps, TaskBoardView } from './TaskBoard';

export {
  parseTaskBoard,
  findTask,
  isReady,
  readyTasks,
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
} from './parseTasks';
export type {
  Task,
  TaskBoardModel,
  TaskCounts,
  TaskGroup,
  TaskLink,
  TaskNote,
  TaskStatus,
  TaskTag,
} from './parseTasks';

export { InlineMarkdown, safeHref } from './inlineMarkdown';

/**
 * Registers `<TaskBoard>` (also available as `<Tasks>`) and takes over
 * ```` ```tasks ```` fenced code blocks, which is the way to write one: the
 * fence body is the checklist the plan is already written in.
 */
export const tasksPlugin = defineMdxPlugin({
  name: '@mdxstudio/tasks',
  components: { TaskBoard },
  aliases: { Tasks: 'TaskBoard' },
  codeFences: { tasks: 'TaskBoard' },
});
