import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import type { Paged, Project, Task } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';
import TaskFilters, { emptyFilters, filtersToParams, type TaskFilterState } from '../components/TaskFilters';
import { TaskRow } from '../components/TaskBits';
import { Button, Card, EmptyState, ErrorState, PageHeader, Select, Spinner, Tabs } from '../components/ui';

type Scope = 'mine' | 'qa' | 'all';

export default function MyTasksPage() {
  const [, setParams] = useSearchParams();
  const [scope, setScope] = useState<Scope>('mine');
  const [filters, setFilters] = useState<TaskFilterState>({ ...emptyFilters, status: '' });
  const [sort, setSort] = useState('due');
  const [page, setPage] = useState(1);
  const q = useDebounce(filters.q, 300);
  const params = useMemo(() => {
    const p: Record<string, string | number> = { ...filtersToParams({ ...filters, q }), sort, page, pageSize: 25 };
    if (scope === 'mine') p.assigneeId = 'me';
    if (scope === 'qa') p.qaAssigneeId = 'me';
    if (!filters.status && scope !== 'all') p.status = 'TODO,IN_PROGRESS';
    return p;
  }, [filters, q, scope, sort, page]);

  const { data: projects } = useQuery({
    queryKey: ['projects', 'mini'],
    queryFn: async () => (await api.get<Paged<Project>>('/projects', { params: { pageSize: 100 } })).data.items,
  });
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['my-tasks', params],
    queryFn: async () => (await api.get<Paged<Task>>('/tasks', { params })).data,
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="My Tasks" subtitle="Everything on your plate across projects. Search and filters run on the server." />
      <Tabs<Scope>
        className="mb-4"
        value={scope}
        onChange={(s) => {
          setScope(s);
          setPage(1);
        }}
        tabs={[
          { id: 'mine', label: 'Assigned to me' },
          { id: 'qa', label: 'My QA testing' },
          { id: 'all', label: 'All accessible tasks' },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TaskFilters
          value={filters}
          onChange={(f) => {
            setFilters(f);
            setPage(1);
          }}
          showStatus
          projects={projects?.map((p) => ({ id: p.id, name: p.name }))}
        />
        <Select aria-label="Sort" className="!h-9 !w-auto !py-0 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="due">Sort: due date</option>
          <option value="priority">Sort: priority</option>
          <option value="updated">Sort: recently updated</option>
          <option value="created">Sort: newest</option>
        </Select>
      </div>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <Card>
          {data!.items.length === 0 ? (
            <EmptyState title="No tasks found" message={scope === 'mine' ? 'You have no open tasks matching these filters.' : 'Try changing the filters.'} />
          ) : (
            <div className={`divide-y divide-slate-100 ${isFetching ? 'opacity-70' : ''}`}>
              {data!.items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={() =>
                    setParams((p) => {
                      p.set('task', t.id);
                      return p;
                    })
                  }
                />
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            <span>{data!.total} tasks</span>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              Page {page} of {pages}
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
