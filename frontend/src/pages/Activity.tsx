import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import type { ActivityEvent, Paged, Project } from '../lib/types';
import ActivityList from '../components/ActivityList';
import { Button, Card, ErrorState, PageHeader, Select, Spinner } from '../components/ui';

const TYPES = [
  'TASK_CREATED',
  'STATUS_CHANGED',
  'ASSIGNEE_CHANGED',
  'SUBMITTED_FOR_QA',
  'QA_PASSED',
  'QA_FAILED',
  'TASK_REOPENED',
  'COMMENT_ADDED',
  'ATTACHMENT_UPLOADED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'PROJECT_CREATED',
];

/** Audit / activity history (Admin: everything; Manager: their projects). */
export default function ActivityPage() {
  const [projectId, setProjectId] = useState('');
  const [eventType, setEventType] = useState('');
  const [page, setPage] = useState(1);
  const projects = useQuery({ queryKey: ['projects', 'mini'], queryFn: async () => (await api.get<Paged<Project>>('/projects', { params: { pageSize: 100 } })).data.items });
  const { data, isLoading, error } = useQuery({
    queryKey: ['activity', projectId, eventType, page],
    queryFn: async () =>
      (await api.get<Paged<ActivityEvent>>('/activity', { params: { projectId: projectId || undefined, eventType: eventType || undefined, page, pageSize: 30 } })).data,
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div>
      <PageHeader title="Activity log" subtitle="A complete, chronological audit trail of changes." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select aria-label="Project" className="!h-9 !w-auto !py-0 text-sm" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }}>
          <option value="">All projects</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Event type" className="!h-9 !w-auto !py-0 text-sm" value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }}>
          <option value="">All events</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={errorMessage(error)} />
      ) : (
        <Card>
          <ActivityList items={data!.items} />
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            <span>{data!.total} events</span>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              Page {page} of {pages}
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
