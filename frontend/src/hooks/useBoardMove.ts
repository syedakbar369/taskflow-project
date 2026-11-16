import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { applyMove } from '../lib/board';
import type { Task, TaskStatus } from '../lib/types';

/**
 * Drag & drop persistence:
 * 1) optimistically update the cached board, 2) PATCH the API, 3) on failure revert to the snapshot
 * and surface the server's message, 4) always re-sync with the server afterwards.
 */
export function useBoardMove(queryKey: QueryKey, onError: (message: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: TaskStatus; position: number }) =>
      (await api.patch<{ task: Task }>(`/tasks/${v.id}/status`, { status: v.status, position: v.position })).data.task,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<{ items: Task[] }>(queryKey);
      if (previous) qc.setQueryData(queryKey, { ...previous, items: applyMove(previous.items, v.id, v.status, v.position) });
      return { previous };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
      onError(errorMessage(err));
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ['task', v.id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
