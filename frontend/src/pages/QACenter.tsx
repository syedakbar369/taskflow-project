import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { fmtDateTime, timeAgo } from '../lib/format';
import type { Paged, QAReport, QAStatus, Task, UserMini } from '../lib/types';
import { TaskRow } from '../components/TaskBits';
import { ReportCard } from '../components/TaskDrawer';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Spinner, Tabs } from '../components/ui';

type Tab = 'queue' | 'mine' | 'failed' | 'history';

export default function QACenterPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('queue');
  const [, setParams] = useSearchParams();
  const open = (id: string) =>
    setParams((p) => {
      p.set('task', id);
      return p;
    });

  const queueParams = tab === 'mine' ? { scope: 'mine' } : tab === 'failed' ? { qaStatus: 'FAILED' } : {};
  const queue = useQuery({
    queryKey: ['qa-queue', queueParams],
    queryFn: async () =>
      (await api.get<{ items: (Task & { submittedBy: UserMini | null })[]; counts: Partial<Record<QAStatus, number>> }>('/qa/queue', { params: queueParams })).data,
    enabled: tab !== 'history',
  });
  const c = queue.data?.counts ?? {};

  return (
    <div>
      <PageHeader
        title="QA Center"
        subtitle={user?.role === 'QA' ? 'Pick up work that is ready for testing, record results and send failures back.' : 'Monitor testing progress across your projects.'}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Awaiting QA', c.AWAITING_QA ?? 0, 'teal'],
          ['In testing', c.IN_TESTING ?? 0, 'amber'],
          ['Failed / reopened', c.FAILED ?? 0, 'red'],
          ['Passed', c.PASSED ?? 0, 'green'],
        ].map(([label, v, tone]) => (
          <div key={label as string} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <Badge tone={tone as 'teal'}>{label}</Badge>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{v}</p>
          </div>
        ))}
      </div>
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'queue', label: 'Ready for testing' },
          { id: 'mine', label: 'Assigned to me' },
          { id: 'failed', label: 'Waiting on developer' },
          { id: 'history', label: 'Report history' },
        ]}
      />
      {tab === 'history' ? (
        <ReportHistory />
      ) : queue.isLoading ? (
        <Spinner />
      ) : queue.error ? (
        <ErrorState message={errorMessage(queue.error)} onRetry={() => void queue.refetch()} />
      ) : (
        <Card>
          {queue.data!.items.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-5 w-5" />} title="Queue is empty" message="Tasks appear here when developers submit them for QA." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {queue.data!.items.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} onOpen={() => open(t.id)} />
                  {t.submittedBy && (
                    <p className="-mt-1 pb-2 pl-10 text-xs text-slate-500">
                      Submitted by {t.submittedBy.name} {t.submittedAt && `· ${timeAgo(t.submittedAt)}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function ReportHistory() {
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['qa-reports-list', result, page],
    queryFn: async () => (await api.get<Paged<QAReport>>('/qa/reports', { params: { result: result || undefined, page, pageSize: 10 } })).data,
    placeholderData: keepPreviousData,
  });
  const [, setParams] = useSearchParams();
  if (isLoading) return <Spinner />;
  if (error) return <ErrorState message={errorMessage(error)} />;
  const pages = Math.max(1, Math.ceil(data!.total / data!.pageSize));
  return (
    <div className="space-y-3">
      <Select aria-label="Result" className="!h-9 !w-auto !py-0 text-sm" value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }}>
        <option value="">All results</option>
        <option value="PASSED">Passed</option>
        <option value="FAILED">Failed</option>
      </Select>
      {data!.items.length === 0 && <Card><EmptyState title="No reports yet" /></Card>}
      <ol className="space-y-3">
        {data!.items.map((r) => (
          <div key={r.id}>
            <button
              className="mb-1 text-xs font-medium text-slate-500 hover:text-coral-700"
              onClick={() =>
                setParams((p) => {
                  p.set('task', r.task.id);
                  return p;
                })
              }
            >
              {r.task.project.key}-{r.task.number} · {r.task.title} · {fmtDateTime(r.submittedAt)}
            </button>
            <ReportCard report={r} />
          </div>
        ))}
      </ol>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-slate-500">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          Page {page} of {pages}
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
