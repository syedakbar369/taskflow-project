import { useQuery } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
import { api } from '../lib/api';
import { PRIORITIES, PRIORITY_LABEL, QA_LABEL, STATUSES, STATUS_LABEL } from '../lib/format';
import type { Label, QAStatus, UserMini } from '../lib/types';
import { Input, Select } from './ui';

export interface TaskFilterState {
  q: string;
  assigneeId: string;
  priority: string;
  labelId: string;
  qaStatus: string;
  status: string;
  reopened: string;
  due: string; // '' | 'overdue' | 'week'
  projectId?: string;
}

export const emptyFilters: TaskFilterState = { q: '', assigneeId: '', priority: '', labelId: '', qaStatus: '', status: '', reopened: '', due: '' };

/** Converts UI filters into API query params (search & filtering happen in the database). */
export function filtersToParams(f: TaskFilterState): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.q.trim()) p.q = f.q.trim();
  if (f.assigneeId) p.assigneeId = f.assigneeId;
  if (f.priority) p.priority = f.priority;
  if (f.labelId) p.labelId = f.labelId;
  if (f.qaStatus) p.qaStatus = f.qaStatus;
  if (f.status) p.status = f.status;
  if (f.reopened) p.reopened = f.reopened;
  if (f.projectId) p.projectId = f.projectId;
  if (f.due === 'overdue') p.overdue = 'true';
  if (f.due === 'week') {
    const now = new Date();
    p.dueFrom = now.toISOString().slice(0, 10);
    p.dueTo = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  }
  return p;
}

export default function TaskFilters({
  value,
  onChange,
  members,
  showStatus,
  projects,
}: {
  value: TaskFilterState;
  onChange: (f: TaskFilterState) => void;
  members?: UserMini[];
  showStatus?: boolean;
  projects?: { id: string; name: string }[];
}) {
  const { data: labels } = useQuery({ queryKey: ['labels'], queryFn: async () => (await api.get<{ items: Label[] }>('/labels')).data.items });
  const set = (k: keyof TaskFilterState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  const active = Object.entries(value).filter(([, v]) => v).length;
  const sel = '!h-9 !w-auto !py-0 text-sm';
  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter tasks">
      <Filter className="h-4 w-4 text-slate-400" aria-hidden />
      <Input aria-label="Search tasks" className="!h-9 max-w-[220px]" placeholder="Search tasks…" value={value.q} onChange={set('q')} />
      {projects && (
        <Select aria-label="Project" className={sel} value={value.projectId ?? ''} onChange={set('projectId')}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
      {members && (
        <Select aria-label="Assignee" className={sel} value={value.assigneeId} onChange={set('assigneeId')}>
          <option value="">Any assignee</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      )}
      {showStatus && (
        <Select aria-label="Status" className={sel} value={value.status} onChange={set('status')}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      )}
      <Select aria-label="Priority" className={sel} value={value.priority} onChange={set('priority')}>
        <option value="">Any priority</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </Select>
      <Select aria-label="Label" className={sel} value={value.labelId} onChange={set('labelId')}>
        <option value="">Any label</option>
        {labels?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
      <Select aria-label="QA status" className={sel} value={value.qaStatus} onChange={set('qaStatus')}>
        <option value="">Any QA status</option>
        {(Object.keys(QA_LABEL) as QAStatus[]).map((q) => (
          <option key={q} value={q}>
            {QA_LABEL[q]}
          </option>
        ))}
      </Select>
      <Select aria-label="Due date" className={sel} value={value.due} onChange={set('due')}>
        <option value="">Any due date</option>
        <option value="overdue">Overdue</option>
        <option value="week">Due in 7 days</option>
      </Select>
      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-coral-600"
          checked={value.reopened === 'true'}
          onChange={(e) => onChange({ ...value, reopened: e.target.checked ? 'true' : '' })}
        />
        Reopened
      </label>
      {active > 0 && (
        <button onClick={() => onChange({ ...emptyFilters, projectId: undefined })} className="inline-flex items-center gap-1 text-sm font-medium text-coral-700 hover:underline">
          <X className="h-3.5 w-3.5" /> Clear filters
        </button>
      )}
    </div>
  );
}
