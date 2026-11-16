import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleDashed, FolderKanban, ListTodo, Loader, RotateCcw, Users, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { ROLE_LABEL, timeAgo } from '../lib/format';
import { countTo, enterChildren } from '../lib/motion';
import type { ActivityEvent, Role, Task, UserMini } from '../lib/types';
import ActivityList from '../components/ActivityList';
import { DonutChart, SimpleBarChart, STATUS_COLORS } from '../components/Charts';
import { TaskRow } from '../components/TaskBits';
import { Avatar, Badge, Card, EmptyState, ErrorState, Spinner } from '../components/ui';

interface DashboardData {
  role: Role;
  summary: { projects: number; total: number; todo: number; inProgress: number; done: number; overdue: number };
  recentActivity: ActivityEvent[];
  upcoming: Task[];
  recentProjects: { id: string; name: string; key: string; color: string; status: string; updatedAt: string }[];
  myTasks: Task[];
  admin?: {
    usersByRole: Partial<Record<Role, number>>;
    projectProgress: { project: { id: string; name: string; color: string }; total: number; done: number; progress: number }[];
    overdue: Task[];
    qa: { passed: number; failed: number };
  };
  manager?: {
    managedProjects: { id: string; name: string; color: string }[];
    workload: { user: UserMini; todo: number; inProgress: number }[];
    atRisk: Task[];
    waitingForQa: Task[];
    qaFailures: Task[];
  };
  qa?: {
    awaitingTesting: Task[];
    myTestTasks: Task[];
    reopened: Task[];
    recentReports: { id: string; title: string; overallResult: 'PASSED' | 'FAILED'; submittedAt: string; tester: UserMini; task: { id: string; title: string; number: number; project: { key: string } } }[];
    myResults: { passed: number; failed: number };
    allResults: { passed: number; failed: number };
  };
  developer?: {
    mine: { todo: number; inProgress: number; done: number; reopened: number };
    returnedByQa: Task[];
    recentComments: { id: string; content: string; createdAt: string; author: UserMini; task: { id: string; title: string; number: number; project: { key: string } } }[];
  };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [, setParams] = useSearchParams();
  const gridRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  });
  useEffect(() => {
    if (data) enterChildren(gridRef.current);
  }, [!!data]);

  const open = (id: string) =>
    setParams((p) => {
      p.set('task', id);
      return p;
    });

  if (isLoading) return <Spinner label="Loading dashboard…" />;
  if (error || !data) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  const s = data.summary;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {greeting()}, {user?.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here's what's happening across your {ROLE_LABEL[data.role].toLowerCase() === 'admin' ? 'workspace' : 'projects'} today.
        </p>
      </div>

      <div ref={gridRef} className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Projects" value={s.projects} icon={<FolderKanban className="h-4 w-4" />} to="/projects" />
        <StatCard label="Total tasks" value={s.total} icon={<ListTodo className="h-4 w-4" />} to="/my-tasks" />
        <StatCard label="To Do" value={s.todo} icon={<CircleDashed className="h-4 w-4" />} />
        <StatCard label="In Progress" value={s.inProgress} icon={<Loader className="h-4 w-4" />} tone="amber" />
        <StatCard label="Done" value={s.done} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
        <StatCard label="Overdue" value={s.overdue} icon={<AlertTriangle className="h-4 w-4" />} tone={s.overdue ? 'red' : undefined} />
      </div>

      {data.developer && <DeveloperSection d={data.developer} open={open} />}
      {data.qa && <QASection d={data.qa} open={open} />}
      {data.manager && <ManagerSection d={data.manager} open={open} />}
      {data.admin && <AdminSection d={data.admin} open={open} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Task status">
          <div className="p-3">
            <DonutChart
              data={[
                { name: 'To Do', value: s.todo, color: STATUS_COLORS.TODO },
                { name: 'In Progress', value: s.inProgress, color: STATUS_COLORS.IN_PROGRESS },
                { name: 'Done', value: s.done, color: STATUS_COLORS.DONE },
              ]}
            />
          </div>
        </Card>
        <Card title="My assigned tasks" className="lg:col-span-2" action={<Link to="/my-tasks" className="text-sm font-medium text-coral-700 hover:underline">View all</Link>}>
          {data.myTasks.length ? (
            <div className="divide-y divide-slate-100">{data.myTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={() => open(t.id)} />)}</div>
          ) : (
            <EmptyState title="Nothing assigned to you" message="Tasks assigned to you will appear here." />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Recent activity" className="lg:col-span-2">
          <ActivityList items={data.recentActivity} />
        </Card>
        <div className="space-y-4">
          <Card title="Upcoming due dates">
            {data.upcoming.length ? (
              <div className="divide-y divide-slate-100">{data.upcoming.map((t) => <TaskRow key={t.id} task={t} onOpen={() => open(t.id)} showProject={false} />)}</div>
            ) : (
              <EmptyState title="No upcoming deadlines" message="Nothing due in the next two weeks." />
            )}
          </Card>
          <Card title="Recently updated projects">
            {data.recentProjects.length ? (
              <ul className="divide-y divide-slate-100">
                {data.recentProjects.map((p) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                      <span className="flex-1 truncate font-medium text-slate-800">{p.name}</span>
                      <span className="text-xs text-slate-400">{timeAgo(p.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No projects yet" />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, tone, to }: { label: string; value: number; icon: React.ReactNode; tone?: 'green' | 'amber' | 'red'; to?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => countTo(ref.current, value), [value]);
  const color = tone === 'green' ? 'text-green-600' : tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-red-600' : 'text-slate-400';
  const body = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-colors hover:border-slate-300">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${color}`}>
        {icon}
        <span className="text-slate-500">{label}</span>
      </div>
      <span ref={ref} className="text-2xl font-semibold text-slate-900" data-testid={`stat-${label}`}>
        {value}
      </span>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function TaskListCard({ title, tasks, open, empty, tone }: { title: React.ReactNode; tasks: Task[]; open: (id: string) => void; empty: string; tone?: string }) {
  return (
    <Card title={title} className={tone}>
      {tasks.length ? (
        <div className="divide-y divide-slate-100">{tasks.map((t) => <TaskRow key={t.id} task={t} onOpen={() => open(t.id)} />)}</div>
      ) : (
        <EmptyState title={empty} />
      )}
    </Card>
  );
}

function DeveloperSection({ d, open }: { d: NonNullable<DashboardData['developer']>; open: (id: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="My work">
        <div className="grid grid-cols-2 gap-2 p-4">
          {[
            ['To Do', d.mine.todo, 'text-slate-700'],
            ['In Progress', d.mine.inProgress, 'text-amber-700'],
            ['Done', d.mine.done, 'text-green-700'],
            ['Reopened', d.mine.reopened, 'text-red-700'],
          ].map(([l, v, c]) => (
            <div key={l as string} className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{l}</p>
              <p className={`text-xl font-semibold ${c}`}>{v}</p>
            </div>
          ))}
        </div>
        <p className="px-4 pb-4 text-xs text-slate-500">Open a task to update progress or submit it for QA.</p>
      </Card>
      <TaskListCard title={<span className="flex items-center gap-1.5"><RotateCcw className="h-4 w-4 text-red-500" /> Returned by QA</span>} tasks={d.returnedByQa} open={open} empty="Nothing returned by QA 🎉" />
      <Card title="Recent comments on my tasks">
        {d.recentComments.length ? (
          <ul className="divide-y divide-slate-100">
            {d.recentComments.map((c) => (
              <li key={c.id}>
                <button onClick={() => open(c.task.id)} className="flex w-full gap-2 px-4 py-2.5 text-left hover:bg-slate-50">
                  <Avatar name={c.author.name} size={24} />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{c.author.name}</span> <span className="text-slate-500">on {c.task.project.key}-{c.task.number}</span>
                    <span className="block truncate text-slate-600">{c.content}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No recent comments" />
        )}
      </Card>
    </div>
  );
}

function QASection({ d, open }: { d: NonNullable<DashboardData['qa']>; open: (id: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <TaskListCard title="Awaiting testing" tasks={d.awaitingTesting} open={open} empty="Nothing waiting for QA" />
      <TaskListCard title="My test tasks" tasks={d.myTestTasks} open={open} empty="No tasks assigned to you for testing" />
      <Card title="Test results" action={<Link to="/qa" className="text-sm font-medium text-coral-700 hover:underline">QA Center</Link>}>
        <div className="grid grid-cols-2 gap-2 p-4">
          <div className="rounded-lg bg-green-50 p-3">
            <p className="text-xs text-green-800">My passed</p>
            <p className="text-xl font-semibold text-green-700">{d.myResults.passed}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3">
            <p className="text-xs text-red-800">My failed</p>
            <p className="text-xl font-semibold text-red-700">{d.myResults.failed}</p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {d.recentReports.slice(0, 5).map((r) => (
            <li key={r.id}>
              <button onClick={() => open(r.task.id)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50">
                {r.overallResult === 'PASSED' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                <span className="flex-1 truncate">{r.title}</span>
                <span className="text-xs text-slate-400">{timeAgo(r.submittedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {d.reopened.length > 0 && <TaskListCard title="Reopened tasks" tasks={d.reopened} open={open} empty="" tone="lg:col-span-3" />}
    </div>
  );
}

function ManagerSection({ d, open }: { d: NonNullable<DashboardData['manager']>; open: (id: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Team workload (open tasks)" className="lg:col-span-2">
        <div className="p-3">
          <SimpleBarChart
            layout="vertical"
            stacked
            xKey="name"
            data={d.workload.map((w) => ({ name: w.user.name, todo: w.todo, inProgress: w.inProgress }))}
            bars={[
              { key: 'todo', name: 'To Do', color: STATUS_COLORS.TODO },
              { key: 'inProgress', name: 'In Progress', color: STATUS_COLORS.IN_PROGRESS },
            ]}
            height={Math.max(160, d.workload.length * 40 + 60)}
          />
        </div>
      </Card>
      <Card title={`Projects I manage (${d.managedProjects.length})`}>
        <ul className="divide-y divide-slate-100">
          {d.managedProjects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <TaskListCard title="Waiting for QA" tasks={d.waitingForQa} open={open} empty="No tasks waiting for QA" />
      <TaskListCard title="QA failures & reopened" tasks={d.qaFailures} open={open} empty="No failed or reopened tasks" />
      <TaskListCard title="Overdue & at risk" tasks={d.atRisk} open={open} empty="Nothing overdue or blocked" />
    </div>
  );
}

function AdminSection({ d, open }: { d: NonNullable<DashboardData['admin']>; open: (id: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Users by role" action={<Link to="/team" className="text-sm font-medium text-coral-700 hover:underline">Manage users</Link>}>
        <ul className="space-y-2 p-4">
          {(['ADMIN', 'MANAGER', 'QA', 'DEVELOPER'] as Role[]).map((r) => (
            <li key={r} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <Users className="h-4 w-4 text-slate-400" />
                {ROLE_LABEL[r]}
              </span>
              <span className="font-semibold">{d.usersByRole[r] ?? 0}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4">
          <div>
            <p className="text-xs text-slate-500">QA passed</p>
            <p className="text-lg font-semibold text-green-700">{d.qa.passed}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">QA failed</p>
            <p className="text-lg font-semibold text-red-700">{d.qa.failed}</p>
          </div>
        </div>
      </Card>
      <Card title="Project progress" action={<Link to="/reports" className="text-sm font-medium text-coral-700 hover:underline">Reports</Link>}>
        <ul className="space-y-3 p-4">
          {d.projectProgress.length === 0 && <EmptyState title="No projects yet" />}
          {d.projectProgress.map((p) => (
            <li key={p.project.id}>
              <div className="mb-1 flex justify-between text-sm">
                <Link to={`/projects/${p.project.id}`} className="truncate font-medium text-slate-800 hover:text-coral-700">
                  {p.project.name}
                </Link>
                <Badge>{p.progress}%</Badge>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: p.project.color }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <TaskListCard title="Overdue tasks" tasks={d.overdue} open={open} empty="Nothing overdue" />
    </div>
  );
}
