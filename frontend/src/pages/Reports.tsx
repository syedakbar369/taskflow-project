import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { fmtDate, PRIORITY_LABEL, STATUS_LABEL } from '../lib/format';
import type { Paged, Priority, Project, TaskStatus, UserMini } from '../lib/types';
import { DonutChart, SimpleBarChart, STATUS_COLORS, TrendChart } from '../components/Charts';
import { DueLabel } from '../components/TaskBits';
import { Avatar, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, Spinner } from '../components/ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);

interface TasksReport {
  range: { from: string; to: string };
  byStatus: { status: TaskStatus; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  byProject: { project: { id: string; name: string; key: string; color: string }; todo: number; inProgress: number; done: number }[];
  completedOverTime: { date: string; count: number }[];
  avgCompletionHours: number | null;
  overdue: { id: string; key: string; title: string; dueDate: string; status: TaskStatus; assignee: UserMini | null; project: { name: string } }[];
  workload: { user: UserMini | null; todo: number; inProgress: number }[];
}
interface QAReportData {
  passed: number;
  failed: number;
  overTime: { date: string; passed: number; failed: number }[];
  byTester: { user: UserMini; passed: number; failed: number }[];
  reopenedTasks: { id: string; key: string; title: string; reopenCount: number; reopenedAt: string; assignee: UserMini | null; project: { name: string } }[];
}
interface Summary {
  snapshot: { projects: number; total: number; todo: number; inProgress: number; done: number; overdue: number };
  inRange: { completed: number; qaPassed: number; qaFailed: number; reopened: number; avgCompletionHours: number | null };
}
interface ActivityReport {
  people: { user: UserMini; tasksCreated: number; statusChanges: number; submittedForQa: number; qaPassed: number; qaFailed: number; comments: number; uploads: number }[];
}

export default function ReportsPage() {
  const [, setParams] = useSearchParams();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [projectId, setProjectId] = useState('');
  const params = { from, to, projectId: projectId || undefined };
  const projects = useQuery({ queryKey: ['projects', 'mini'], queryFn: async () => (await api.get<Paged<Project>>('/projects', { params: { pageSize: 100 } })).data.items });
  const summary = useQuery({ queryKey: ['reports', 'summary', params], queryFn: async () => (await api.get<Summary>('/reports/summary', { params })).data });
  const tasks = useQuery({ queryKey: ['reports', 'tasks', params], queryFn: async () => (await api.get<TasksReport>('/reports/tasks', { params })).data });
  const qa = useQuery({ queryKey: ['reports', 'qa', params], queryFn: async () => (await api.get<QAReportData>('/reports/qa', { params })).data });
  const activity = useQuery({ queryKey: ['reports', 'activity', params], queryFn: async () => (await api.get<ActivityReport>('/reports/activity', { params })).data });
  const open = (id: string) =>
    setParams((p) => {
      p.set('task', id);
      return p;
    });

  const err = summary.error || tasks.error || qa.error;
  const rangeLabel = `${fmtDate(from)} – ${fmtDate(to)}`;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Objective task and QA workflow metrics, computed from your project data." />
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <Field label="From" htmlFor="r-from">
          <Input id="r-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="!h-9" />
        </Field>
        <Field label="To" htmlFor="r-to">
          <Input id="r-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="!h-9" />
        </Field>
        <Field label="Project" htmlFor="r-project">
          <Select id="r-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="!h-9 !py-0">
            <option value="">All my projects</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-1 pb-0.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => {
                setFrom(iso(new Date(Date.now() - (d - 1) * 86400000)));
                setTo(iso(new Date()));
              }}
            >
              Last {d} days
            </button>
          ))}
        </div>
      </div>
      {err ? (
        <ErrorState message={errorMessage(err)} />
      ) : summary.isLoading || tasks.isLoading || qa.isLoading ? (
        <Spinner label="Crunching numbers…" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Open tasks (now)" value={summary.data!.snapshot.todo + summary.data!.snapshot.inProgress} />
            <Kpi label="Overdue (now)" value={summary.data!.snapshot.overdue} tone={summary.data!.snapshot.overdue ? 'red' : undefined} />
            <Kpi label="Completed in range" value={summary.data!.inRange.completed} tone="green" />
            <Kpi label="QA passed in range" value={summary.data!.inRange.qaPassed} tone="green" />
            <Kpi label="QA failed in range" value={summary.data!.inRange.qaFailed} tone="red" />
            <Kpi
              label="Avg. time to complete"
              value={summary.data!.inRange.avgCompletionHours === null ? '—' : formatHours(summary.data!.inRange.avgCompletionHours)}
            />
          </div>
          <p className="text-xs text-slate-500">
            “Now” values are a current snapshot. Everything else covers <b>{rangeLabel}</b>. Status and priority charts include tasks created in this range.
          </p>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={`Tasks by status · created ${rangeLabel}`}>
              <div className="p-3">
                <DonutChart data={tasks.data!.byStatus.map((s) => ({ name: STATUS_LABEL[s.status], value: s.count, color: STATUS_COLORS[s.status] }))} />
              </div>
            </Card>
            <Card title={`Tasks by priority · created ${rangeLabel}`}>
              <div className="p-3">
                <SimpleBarChart
                  xKey="name"
                  data={tasks.data!.byPriority.map((p) => ({ name: PRIORITY_LABEL[p.priority], count: p.count }))}
                  bars={[{ key: 'count', name: 'Tasks', color: '#F06A4A' }]}
                />
              </div>
            </Card>
            <Card title="QA results">
              <div className="p-3">
                <DonutChart
                  data={[
                    { name: 'Passed', value: qa.data!.passed, color: '#16A34A' },
                    { name: 'Failed', value: qa.data!.failed, color: '#DC2626' },
                  ]}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Tasks completed over time · ${rangeLabel}`}>
              <div className="p-3">
                <TrendChart data={tasks.data!.completedOverTime} lines={[{ key: 'count', name: 'Completed', color: '#16A34A' }]} />
              </div>
            </Card>
            <Card title={`QA reports over time · ${rangeLabel}`}>
              <div className="p-3">
                <TrendChart
                  data={qa.data!.overTime}
                  lines={[
                    { key: 'passed', name: 'Passed', color: '#16A34A' },
                    { key: 'failed', name: 'Failed', color: '#DC2626' },
                  ]}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Tasks by project · created ${rangeLabel}`}>
              <div className="p-3">
                <SimpleBarChart
                  layout="vertical"
                  stacked
                  xKey="name"
                  data={tasks.data!.byProject.map((p) => ({ name: p.project.name, todo: p.todo, inProgress: p.inProgress, done: p.done }))}
                  bars={[
                    { key: 'todo', name: 'To Do', color: STATUS_COLORS.TODO },
                    { key: 'inProgress', name: 'In Progress', color: STATUS_COLORS.IN_PROGRESS },
                    { key: 'done', name: 'Done', color: STATUS_COLORS.DONE },
                  ]}
                  height={Math.max(180, tasks.data!.byProject.length * 44 + 60)}
                />
              </div>
            </Card>
            <Card title="Workload by assignee (open tasks, now)">
              <div className="p-3">
                <SimpleBarChart
                  layout="vertical"
                  stacked
                  xKey="name"
                  data={tasks.data!.workload.map((w) => ({ name: w.user?.name ?? 'Unassigned', todo: w.todo, inProgress: w.inProgress }))}
                  bars={[
                    { key: 'todo', name: 'To Do', color: STATUS_COLORS.TODO },
                    { key: 'inProgress', name: 'In Progress', color: STATUS_COLORS.IN_PROGRESS },
                  ]}
                  height={Math.max(180, tasks.data!.workload.length * 40 + 60)}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Overdue tasks (now · ${tasks.data!.overdue.length})`}>
              {tasks.data!.overdue.length === 0 ? (
                <EmptyState title="Nothing overdue" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {tasks.data!.overdue.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => open(t.id)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                        <span className="text-xs text-slate-400">{t.key}</span>
                        <span className="flex-1 truncate font-medium">{t.title}</span>
                        <DueLabel due={t.dueDate} />
                        {t.assignee && <Avatar name={t.assignee.name} size={22} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`Reopened tasks · ${rangeLabel}`}>
              {qa.data!.reopenedTasks.length === 0 ? (
                <EmptyState title="No reopened tasks" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {qa.data!.reopenedTasks.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => open(t.id)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                        <span className="text-xs text-slate-400">{t.key}</span>
                        <span className="flex-1 truncate font-medium">{t.title}</span>
                        <span className="text-xs text-red-600">reopened {t.reopenCount}×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title={`Developer & QA activity summary · ${rangeLabel}`}>
            {!activity.data?.people.length ? (
              <EmptyState title="No activity in this range" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {['Person', 'Tasks created', 'Status changes', 'Submitted for QA', 'QA passed', 'QA failed', 'Comments', 'Uploads'].map((h) => (
                        <th key={h} className="px-4 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activity.data.people.map((p) => (
                      <tr key={p.user.id}>
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-2">
                            <Avatar name={p.user.name} size={22} />
                            {p.user.name}
                            <span className="text-xs text-slate-400">{p.user.role.toLowerCase()}</span>
                          </span>
                        </td>
                        {[p.tasksCreated, p.statusChanges, p.submittedForQa, p.qaPassed, p.qaFailed, p.comments, p.uploads].map((v, i) => (
                          <td key={i} className="px-4 py-2 tabular-nums text-slate-700">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-xs text-slate-500">Counts of recorded workflow events only — not a productivity score.</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function formatHours(h: number) {
  return h < 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} days`;
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'green' | 'red' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

