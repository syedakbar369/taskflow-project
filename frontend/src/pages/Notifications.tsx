import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { fmtDateTime, timeAgo } from '../lib/format';
import type { Notification, Paged } from '../lib/types';
import { Avatar, Button, Card, EmptyState, ErrorState, PageHeader, Spinner, Tabs } from '../components/ui';

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', filter, page],
    queryFn: async () =>
      (await api.get<Paged<Notification> & { unreadCount: number }>('/notifications', { params: { unreadOnly: filter === 'unread', page, pageSize: 20 } })).data,
    placeholderData: keepPreviousData,
  });
  const readAll = useMutation({ mutationFn: () => api.patch('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readOne = useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={data ? `${data.unreadCount} unread` : undefined}
        actions={
          !!data?.unreadCount && (
            <Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} loading={readAll.isPending} onClick={() => readAll.mutate()}>
              Mark all as read
            </Button>
          )
        }
      />
      <Tabs
        className="mb-4"
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setPage(1);
        }}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread' },
        ]}
      />
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <Card>
          {data!.items.length === 0 ? (
            <EmptyState icon={<Bell className="h-5 w-5" />} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} message="You'll be notified about assignments, QA results, mentions and due dates." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data!.items.map((n) => (
                <li key={n.id}>
                  <button
                    className={clsx('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50', !n.readAt && 'bg-coral-50/40')}
                    onClick={() => {
                      if (!n.readAt) readOne.mutate(n.id);
                      if (n.relatedTaskId)
                        setParams((p) => {
                          p.set('task', n.relatedTaskId!);
                          return p;
                        });
                      else if (n.relatedProjectId) navigate(`/projects/${n.relatedProjectId}`);
                    }}
                  >
                    {n.actor ? <Avatar name={n.actor.name} url={n.actor.avatarUrl} size={32} /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"><Bell className="h-4 w-4 text-slate-400" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {n.title}
                        {!n.readAt && <span className="h-2 w-2 rounded-full bg-coral-500" aria-label="Unread" />}
                      </span>
                      <span className="block text-sm text-slate-600">{n.message}</span>
                      <span className="text-xs text-slate-400" title={fmtDateTime(n.createdAt)}>
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              Page {page} of {pages}
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
