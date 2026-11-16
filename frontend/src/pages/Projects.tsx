import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderPlus, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { fmtDate, PROJECT_STATUS_LABEL } from '../lib/format';
import type { Paged, Project, ProjectStatus } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';
import ProjectFormModal from '../components/ProjectFormModal';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Spinner } from '../components/ui';

export default function ProjectsPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | ProjectStatus>('');
  const [creating, setCreating] = useState(false);
  const dq = useDebounce(q, 300);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', { q: dq, status }],
    queryFn: async () => (await api.get<Paged<Project>>('/projects', { params: { q: dq || undefined, status: status || undefined } })).data,
  });
  const canCreate = hasRole('ADMIN', 'MANAGER');

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Boards for every initiative your team is working on."
        actions={
          canCreate && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New project
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search projects" className="!h-9 max-w-xs" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Project status" className="!h-9 !w-auto !py-0 text-sm" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')}>
          <option value="">Active & on hold</option>
          {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : data!.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderPlus className="h-5 w-5" />}
            title={q || status ? 'No projects match' : 'No projects yet'}
            message={canCreate ? 'Create a project to start planning work.' : 'You will see projects here once a manager adds you to one.'}
            action={canCreate && !q ? <Button size="sm" onClick={() => setCreating(true)}>Create project</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data!.items.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-colors hover:border-slate-300">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg" style={{ background: p.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900 group-hover:text-coral-700">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.key} · Owner {p.owner.name}
                  </p>
                </div>
                {p.status !== 'ACTIVE' && <Badge tone={p.status === 'ARCHIVED' ? 'red' : p.status === 'COMPLETED' ? 'green' : 'amber'}>{PROJECT_STATUS_LABEL[p.status]}</Badge>}
              </div>
              {p.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>
                    {p.stats.done}/{p.stats.total} tasks done
                  </span>
                  <span>{p.stats.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-green-500" style={{ width: `${p.stats.progress}%` }} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex -space-x-1.5">
                  {p.members.slice(0, 5).map((m) => (
                    <Avatar key={m.id} name={m.user.name} url={m.user.avatarUrl} size={24} className="ring-2 ring-white" />
                  ))}
                  {(p._count?.members ?? 0) > 5 && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] ring-2 ring-white">+{(p._count?.members ?? 0) - 5}</span>}
                </div>
                <span className="text-xs text-slate-500">
                  {p.stats.overdue > 0 ? <span className="font-medium text-red-600">{p.stats.overdue} overdue</span> : p.dueDate ? `Target ${fmtDate(p.dueDate, 'MMM d')}` : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <ProjectFormModal open={creating} onClose={() => setCreating(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />
    </div>
  );
}
