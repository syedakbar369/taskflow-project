import { describe, expect, it } from 'vitest';
import { applyMove, canDrag, columnTasks, computeDrop } from '../lib/board';
import type { Task } from '../lib/types';

const mk = (id: string, status: Task['status'], position: number, extra: Partial<Task> = {}) =>
  ({ id, status, position, assigneeId: null, qaRequired: false, qaStatus: 'NOT_REQUIRED', ...extra }) as Task;

const tasks = [mk('a', 'TODO', 1000), mk('b', 'TODO', 2000), mk('c', 'IN_PROGRESS', 1000), mk('d', 'DONE', 1000)];

describe('board drag logic', () => {
  it('drops onto an empty area of a column at the end', () => {
    expect(computeDrop(tasks, 'a', 'col:IN_PROGRESS')).toEqual({ status: 'IN_PROGRESS', position: 2000 });
  });
  it('drops before a card in another column', () => {
    expect(computeDrop(tasks, 'a', 'c')).toEqual({ status: 'IN_PROGRESS', position: 0 });
  });
  it('reorders within a column', () => {
    expect(computeDrop(tasks, 'a', 'b')).toEqual({ status: 'TODO', position: 3000 });
  });
  it('returns null for no-op drops', () => {
    expect(computeDrop(tasks, 'b', 'col:TODO')).toBeNull();
  });
  it('applyMove updates status/position immutably', () => {
    const next = applyMove(tasks, 'a', 'DONE', 5);
    expect(columnTasks(next, 'DONE').map((t) => t.id)).toEqual(['a', 'd']);
    expect(tasks[0]!.status).toBe('TODO');
  });
  it('canDrag mirrors server permissions', () => {
    const t = mk('x', 'TODO', 1, { assigneeId: 'u1' });
    expect(canDrag(t, { id: 'u1', role: 'DEVELOPER' }, false)).toBe(true);
    expect(canDrag(t, { id: 'u2', role: 'DEVELOPER' }, false)).toBe(false);
    expect(canDrag(t, { id: 'u1', role: 'QA' }, false)).toBe(false);
    expect(canDrag(t, { id: 'u9', role: 'MANAGER' }, true)).toBe(true);
  });
});
