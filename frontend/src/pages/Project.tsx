import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, Columns3, LayoutList, Pencil, Plus, RotateCcw, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { fmtDate, PROJECT_STATUS_LABEL, ROLE_LABEL } from '../lib/format';
import type { ActivityEvent, Project, Task, TaskStatus, User } from '../lib/types';
import { useBoardMove } from '../hooks/useBoardMove';
import { useDebounce } from '../hooks/useDebounce';
import Board from '../components/Board';
import TaskFilters, { emptyFilters, filtersToParams, type TaskFilterState } from '../components/TaskFilters';
import TaskFormModal from '../components/TaskFormModal';
import ProjectFormModal from '../components/ProjectFormModal';
import ActivityList from '../components/ActivityList';
import { DueLabel, PriorityBadge, QABadge, StatusBadge } from '../components/TaskBits';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

type View = 'board' | 'list' | 'overview';

export default function ProjectPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'board';
  const { user } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState<TaskFilterState>(emptyFilters);
  const [taskModal, setTaskModal] = useState<{ status: TaskStatus } | null>(null);
  const [editProject, setEditProject] = useState(false);
  const debouncedQ = useDebounce(filters.q, 300);
  const apiParams = useMemo(() => filtersToParams({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  const projectQ = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => (await api.get<{ project: Project }>(`/projects/${projectId}`)).data.project,
  });
  const tasksKey = ['tasks', projectId, apiParams];
  const tasksQ = useQuery({
    queryKey: tasksKey,
    queryFn: async () => (await api.get<{ items: Task[] }>(`/projects/${projectId}/tasks`, { params: apiParams })).data,
    enabled: projectQ.isSuccess,
  });
  const move = useBoardMove(tasksKey, (m) => toast(m, 'error'));

  const openTask = (id: string) =>
    setParams((p) => {
      p.set('task', id);
      return p;
    });
  const setView = (v: View) =>
    setParams((p) => {
      p.set('view', v);
      return p;
    });

  if (projectQ.isLoading) return <Spinner />;
  if (projectQ.error) return <ErrorState message={errorMessage(projectQ.error)} onRetry={() => void projectQ.refetch()} />;
  const project = projectQ.data!;
  const canManage = !!project.canManage;
  const members = project.members.map((m) => m.user);

  return (
    <div>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <span className="mt-1 h-9 w-9 shrink-0 rounded-lg" style={{ background: project.color }} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            {project.name}
            <Badge>{project.key}</Badge>
            {project.status !== 'ACTIVE' && <Badge tone={project.status === 'ARCHIVED' ? 'red' : 'amber'}>{PROJECT_STATUS_LABEL[project.status]}</Badge>}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {project.stats.total} tasks · {project.stats.progress}% done · {project.members.length} members
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="View">
            {(
              [
                ['board', 'Board', Columns3],
                ['list', 'List', LayoutList],
                ['overview', 'Overview', null],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {label}
              </button>
            ))}
          </div>
          {canManage && !project.archivedAt && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setTaskModal({ status: 'TODO' })}>
              Add task
            </Button>
          )}
        </div>
      </div>

      {view !== 'overview' && (
        <div className="mb-4">
          <TaskFilters value={filters} onChange={setFilters} members={members} showStatus={view === 'list'} />
        </div>
      )}

      {view === 'board' &&
        (tasksQ.isLoading ? (
          <Spinner />
        ) : tasksQ.error ? (
          <ErrorState message={errorMessage(tasksQ.error)} onRetry={() => void tasksQ.refetch()} />
        ) : (
          <>
            {tasksQ.data!.items.length === 0 && Object.values(apiParams).length === 0 && (
              <Card className="mb-4">
                <EmptyState
                  title="This board is empty"
                  message={canManage ? 'Create the first task to get the team going.' : 'Tasks will appear here when a manager creates them.'}
                  action={canManage ? <Button size="sm" onClick={() => setTaskModal({ status: 'TODO' })}>Create a task</Button> : undefined}
                />
              </Card>
            )}
            <Board
              tasks={tasksQ.data!.items}
              user={user!}
              canManage={canManage}
              onOpen={openTask}
              onAdd={(status) => setTaskModal({ status })}
              onMove={(id, status, position) => move.mutate({ id, status, position })}
            />
            <p className="mt-3 text-xs text-slate-400">
              Tip: drag cards between columns. QA-required tasks move to Done automatically once QA passes them.
            </p>
          </>
        ))}

      {view === 'list' && <ListView loading={tasksQ.isLoading} tasks={tasksQ.data?.items ?? []} onOpen={openTask} />}
      {view === 'overview' && <OverviewView project={project} canManage={canManage} onEdit={() => setEditProject(true)} />}

      <TaskFormModal open={!!taskModal} onClose={() => setTaskModal(null)} project={project} defaultStatus={taskModal?.status} onSaved={(t) => openTask(t.id)} />
      <ProjectFormModal open={editProject} onClose={() => setEditProject(false)} project={project} />
    </div>
  );
}

function ListView({ tasks, loading, onOpen }: { tasks: Task[]; loading: boolean; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<'key' | 'due' | 'priority' | 'status'>('key');
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };
  const sorted = [...tasks].sort((a, b) =>
    sort === 'due'
      ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
      : sort === 'priority'
        ? order[b.priority] - order[a.priority]
        : sort === 'status'
          ? a.status.localeCompare(b.status)
          : a.number - b.number,
  );
  if (loading) return <Spinner />;
  if (!tasks.length) return <Card><EmptyState title="No tasks match" message="Try clearing some filters." /></Card>;
  const th = (k: typeof sort, label: string) => (
    <th className="px-3 py-2 font-medium">
      <button onClick={() => setSort(k)} className={sort === k ? 'text-slate-900' : ''}>
        {label}
        {sort === k ? ' ↓' : ''}
      </button>
    </th>
  );
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {th('key', 'Task')}
            {th('status', 'Status')}
            {th('priority', 'Priority')}
            <th className="px-3 py-2 font-medium">QA</th>
            <th className="px-3 py-2 font-medium">Assignee</th>
            {th('due', 'Due')}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((t) => (
            <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(t.id)}>
              <td className="px-3 py-2.5">
                <span className="mr-2 text-xs text-slate-400">{t.key}</span>
                <button className="font-medium text-slate-800 hover:text-coral-700" onClick={() => onOpen(t.id)}>
                  {t.title}
                </button>
              </td>
              <td className="px-3 py-2.5"><StatusBadge status={t.status} /></td>
              <td className="px-3 py-2.5"><PriorityBadge priority={t.priority} /></td>
              <td className="px-3 py-2.5"><QABadge status={t.qaStatus} /></td>
              <td className="px-3 py-2.5">
                {t.assignee ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar name={t.assignee.name} size={22} />
                    {t.assignee.name}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-3 py-2.5"><DueLabel due={t.dueDate} done={t.status === 'DONE'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function OverviewView({ project, canManage, onEdit }: { project: Project; canManage: boolean; onEdit: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const activity = useQuery({
    queryKey: ['project-activity', project.id],
    queryFn: async () => (await api.get<{ items: ActivityEvent[] }>(`/projects/${project.id}/activity`, { params: { pageSize: 20 } })).data.items,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['project', project.id] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };
  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/projects/${project.id}/members/${userId}`),
    onSuccess: () => {
      toast('Member removed');
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const archive = useMutation({
    mutationFn: () => (project.archivedAt ? api.post(`/projects/${project.id}/restore`) : api.delete(`/projects/${project.id}`)),
    onSuccess: () => {
      toast(project.archivedAt ? 'Project restored' : 'Project archived');
      setArchiveOpen(false);
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const destroy = useMutation({
    mutationFn: () => api.delete(`/projects/${project.id}`, { params: { permanent: 'true', confirm: confirmName } }),
    onSuccess: () => {
      toast('Project permanently deleted');
      void qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const s = project.stats;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card
          title="About"
          action={
            canManage && (
              <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
                Edit
              </Button>
            )
          }
        >
          <div className="space-y-4 p-4 text-sm">
            <p className="whitespace-pre-wrap text-slate-700">{project.description || <span className="text-slate-400">No description.</span>}</p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Owner" value={project.owner.name} />
              <Stat label="Status" value={PROJECT_STATUS_LABEL[project.status]} />
              <Stat label="Start" value={fmtDate(project.startDate)} />
              <Stat label="Target" value={fmtDate(project.dueDate)} />
              <Stat label="Created" value={fmtDate(project.createdAt)} />
              <Stat label="Updated" value={fmtDate(project.updatedAt)} />
            </dl>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Progress</span>
                <span>
                  {s.done}/{s.total} done · {s.progress}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${s.progress}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['To Do', s.todo],
                ['In Progress', s.inProgress],
                ['Done', s.done],
                ['Overdue', s.overdue],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{l}</p>
                  <p className="text-xl font-semibold text-slate-900">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title="Recent activity">{activity.isLoading ? <Spinner /> : <ActivityList items={activity.data ?? []} />}</Card>
      </div>
      <div className="space-y-4">
        <Card
          title={`Members (${project.members.length})`}
          action={
            canManage && (
              <Button size="sm" variant="ghost" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                Add
              </Button>
            )
          }
        >
          <ul className="divide-y divide-slate-100">
            {project.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Avatar name={m.user.name} url={m.user.avatarUrl} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{m.user.name}</p>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABEL[m.user.role]}
                    {m.userId === project.ownerId && ' · Owner'}
                  </p>
                </div>
                {canManage && m.userId !== project.ownerId && m.userId !== user?.id && (
                  <button aria-label={`Remove ${m.user.name}`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeMember.mutate(m.userId)}>
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {project.qaStats && Object.keys(project.qaStats).length > 0 && (
          <Card title="QA status">
            <ul className="space-y-1 p-4 text-sm">
              {Object.entries(project.qaStats).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span className="text-slate-600">{k.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {canManage && (
          <Card title="Project settings">
            <div className="space-y-2 p-4">
              <Button variant="secondary" className="w-full" icon={project.archivedAt ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />} onClick={() => setArchiveOpen(true)}>
                {project.archivedAt ? 'Restore project' : 'Archive project'}
              </Button>
              {user?.role === 'ADMIN' && project.archivedAt && (
                <Button variant="danger" className="w-full" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
                  Delete permanently
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} project={project} onAdded={refresh} />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={project.archivedAt ? 'Restore project?' : 'Archive project?'}
        message={project.archivedAt ? 'The project and its tasks become active again.' : 'Archived projects are hidden from lists and boards. Nothing is deleted and you can restore it later.'}
        confirmLabel={project.archivedAt ? 'Restore' : 'Archive'}
        loading={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete project permanently?"
        danger
        confirmLabel="Delete forever"
        loading={destroy.isPending}
        onConfirm={() => destroy.mutate()}
        message={<>This deletes all tasks, comments, QA reports and files in <b>{project.name}</b>. Audit log entries are kept. This cannot be undone.</>}
      >
        <Field label={`Type “${project.name}” to confirm`} htmlFor="confirm-name">
          <Input id="confirm-name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function AddMemberModal({ open, onClose, project, onAdded }: { open: boolean; onClose: () => void; project: Project; onAdded: () => void }) {
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const { data } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: async () => (await api.get<{ items: User[] }>('/users', { params: { status: 'active', pageSize: 100 } })).data.items,
    enabled: open,
  });
  const candidates = data?.filter((u) => !project.members.some((m) => m.userId === u.id)) ?? [];
  const add = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/members`, { userId }),
    onSuccess: () => {
      toast('Member added');
      setUserId('');
      onAdded();
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add project member"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!userId} loading={add.isPending} onClick={() => add.mutate()}>
            Add member
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-slate-500">Everyone is already a member. Admins can invite new people from the Team page.</p>
      ) : (
        <Field label="Person" htmlFor="member-select">
          <Select id="member-select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose a person…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {ROLE_LABEL[u.role]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
