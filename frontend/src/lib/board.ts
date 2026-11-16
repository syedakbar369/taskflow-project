import type { Role, Task, TaskStatus } from './types';

/** Tasks of one column ordered by position. */
export function columnTasks(tasks: Task[], status: TaskStatus) {
  return tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
}

/**
 * Compute target status + position for a dropped card.
 * overId is either another task id or a column id ("col:TODO").
 */
export function computeDrop(tasks: Task[], activeId: string, overId: string): { status: TaskStatus; position: number } | null {
  const active = tasks.find((t) => t.id === activeId);
  if (!active) return null;
  let status: TaskStatus;
  let index: number;
  const others = (s: TaskStatus) => columnTasks(tasks, s).filter((t) => t.id !== activeId);

  if (overId.startsWith('col:')) {
    status = overId.slice(4) as TaskStatus;
    index = others(status).length; // drop at end of column
  } else {
    const over = tasks.find((t) => t.id === overId);
    if (!over) return null;
    status = over.status;
    const col = others(status);
    index = col.findIndex((t) => t.id === over.id);
    // Moving down within the same column: place after the hovered card.
    const sameCol = active.status === status;
    if (sameCol && active.position < over.position) index += 1;
    if (index < 0) index = col.length;
  }
  const col = others(status);
  const prev = col[index - 1]?.position;
  const next = col[index]?.position;
  const position =
    prev !== undefined && next !== undefined ? (prev + next) / 2 : prev !== undefined ? prev + 1000 : next !== undefined ? next - 1000 : 1000;
  if (status === active.status && position === active.position) return null;
  return { status, position };
}

export function applyMove(tasks: Task[], id: string, status: TaskStatus, position: number): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, status, position } : t));
}

/** Client-side mirror of server rules — used only to disable impossible drags; the API is authoritative. */
export function canDrag(task: Task, user: { id: string; role: Role }, canManage: boolean) {
  return canManage || (task.assigneeId === user.id && user.role !== 'QA');
}
