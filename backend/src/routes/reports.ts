import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { optionalDate, parse } from '../lib/validate';
import { badRequest } from '../lib/errors';
import { me, type AuthUser } from '../middleware/auth';
import { assertProjectAccess, projectScope, taskScope } from '../services/access';
import { userMini } from '../services/serializers';

export const reportsRouter = Router();

const DAY = 24 * 60 * 60 * 1000;

async function resolveFilters(user: AuthUser, query: unknown) {
  const q = parse(z.object({ projectId: z.string().optional(), from: optionalDate, to: optionalDate }), query);
  if (q.projectId) await assertProjectAccess(user, q.projectId);
  const to = q.to ? new Date(q.to.getTime() + (q.to.getUTCHours() === 0 ? DAY - 1 : 0)) : new Date();
  const from = q.from ?? new Date(to.getTime() - 29 * DAY);
  if (from > to) throw badRequest('"from" must be before "to"');
  if (to.getTime() - from.getTime() > 731 * DAY) throw badRequest('Date range can be at most 2 years');
  const base: Prisma.TaskWhereInput = {
    AND: [taskScope(user), { archivedAt: null }, q.projectId ? { projectId: q.projectId } : {}],
  };
  return { projectId: q.projectId, from, to, base };
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayBuckets(from: Date, to: Date) {
  const out: string[] = [];
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= to.getTime(); t += DAY) {
    out.push(dayKey(new Date(t)));
  }
  return out;
}

export async function taskSnapshot(base: Prisma.TaskWhereInput) {
  const [byStatus, overdue] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.task.count({ where: { AND: [base, { status: { not: 'DONE' }, dueDate: { lt: new Date() } }] } }),
  ]);
  const s = (k: string) => byStatus.find((b) => b.status === k)?._count._all ?? 0;
  return { total: s('TODO') + s('IN_PROGRESS') + s('DONE'), todo: s('TODO'), inProgress: s('IN_PROGRESS'), done: s('DONE'), overdue };
}

reportsRouter.get('/summary', async (req, res) => {
  const user = me(req);
  const { from, to, base, projectId } = await resolveFilters(user, req.query);
  const [snapshot, projects, qa, reopened, completed] = await Promise.all([
    taskSnapshot(base),
    prisma.project.count({ where: { ...projectScope(user), archivedAt: null, ...(projectId ? { id: projectId } : {}) } }),
    prisma.qAReport.groupBy({ by: ['overallResult'], where: { task: base, submittedAt: { gte: from, lte: to } }, _count: { _all: true } }),
    prisma.task.count({ where: { AND: [base, { reopenedAt: { gte: from, lte: to } }] } }),
    prisma.task.findMany({ where: { AND: [base, { completedAt: { gte: from, lte: to } }] }, select: { createdAt: true, completedAt: true } }),
  ]);
  const avg = completed.length
    ? completed.reduce((acc, t) => acc + (t.completedAt!.getTime() - t.createdAt.getTime()), 0) / completed.length / 3600000
    : null;
  res.json({
    range: { from, to },
    snapshot: { ...snapshot, projects },
    inRange: {
      completed: completed.length,
      qaPassed: qa.find((q) => q.overallResult === 'PASSED')?._count._all ?? 0,
      qaFailed: qa.find((q) => q.overallResult === 'FAILED')?._count._all ?? 0,
      reopened,
      avgCompletionHours: avg === null ? null : Math.round(avg * 10) / 10,
    },
  });
});

reportsRouter.get('/tasks', async (req, res) => {
  const user = me(req);
  const { from, to, base } = await resolveFilters(user, req.query);
  const createdInRange: Prisma.TaskWhereInput = { AND: [base, { createdAt: { gte: from, lte: to } }] };
  const [byStatus, byPriority, byProjectRaw, completed, overdue, workloadRaw] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where: createdInRange, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['priority'], where: createdInRange, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['projectId', 'status'], where: createdInRange, _count: { _all: true } }),
    prisma.task.findMany({ where: { AND: [base, { completedAt: { gte: from, lte: to } }] }, select: { createdAt: true, completedAt: true } }),
    prisma.task.findMany({
      where: { AND: [base, { status: { not: 'DONE' }, dueDate: { lt: new Date() } }] },
      include: { assignee: userMini, project: { select: { id: true, key: true, name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 50,
    }),
    prisma.task.groupBy({ by: ['assigneeId', 'status'], where: { AND: [base, { status: { not: 'DONE' } }] }, _count: { _all: true } }),
  ]);
  const projects = await prisma.project.findMany({
    where: { id: { in: [...new Set(byProjectRaw.map((p) => p.projectId))] } },
    select: { id: true, name: true, key: true, color: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: workloadRaw.map((w) => w.assigneeId).filter((x): x is string => !!x) } },
    select: userMini.select,
  });
  const buckets = dayBuckets(from, to);
  const completedMap = new Map(buckets.map((b) => [b, 0]));
  for (const t of completed) {
    const k = dayKey(t.completedAt!);
    if (completedMap.has(k)) completedMap.set(k, completedMap.get(k)! + 1);
  }
  const avg = completed.length
    ? completed.reduce((a, t) => a + (t.completedAt!.getTime() - t.createdAt.getTime()), 0) / completed.length / 3600000
    : null;
  res.json({
    range: { from, to },
    byStatus: ['TODO', 'IN_PROGRESS', 'DONE'].map((s) => ({ status: s, count: byStatus.find((b) => b.status === s)?._count._all ?? 0 })),
    byPriority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => ({
      priority: p,
      count: byPriority.find((b) => b.priority === p)?._count._all ?? 0,
    })),
    byProject: projects.map((p) => {
      const c = (s: string) => byProjectRaw.find((b) => b.projectId === p.id && b.status === s)?._count._all ?? 0;
      return { project: p, todo: c('TODO'), inProgress: c('IN_PROGRESS'), done: c('DONE') };
    }),
    completedOverTime: [...completedMap.entries()].map(([date, count]) => ({ date, count })),
    avgCompletionHours: avg === null ? null : Math.round(avg * 10) / 10,
    overdue: overdue.map((t) => ({
      id: t.id,
      key: `${t.project.key}-${t.number}`,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
      assignee: t.assignee,
      project: t.project,
    })),
    workload: [
      ...users.map((u) => ({
        user: u,
        todo: workloadRaw.find((w) => w.assigneeId === u.id && w.status === 'TODO')?._count._all ?? 0,
        inProgress: workloadRaw.find((w) => w.assigneeId === u.id && w.status === 'IN_PROGRESS')?._count._all ?? 0,
      })),
      {
        user: null,
        todo: workloadRaw.find((w) => !w.assigneeId && w.status === 'TODO')?._count._all ?? 0,
        inProgress: workloadRaw.find((w) => !w.assigneeId && w.status === 'IN_PROGRESS')?._count._all ?? 0,
      },
    ].filter((w) => w.todo + w.inProgress > 0),
  });
});

reportsRouter.get('/qa', async (req, res) => {
  const user = me(req);
  const { from, to, base } = await resolveFilters(user, req.query);
  const reports = await prisma.qAReport.findMany({
    where: { task: base, submittedAt: { gte: from, lte: to } },
    select: { overallResult: true, submittedAt: true, testerId: true },
  });
  const reopenedTasks = await prisma.task.findMany({
    where: { AND: [base, { reopenCount: { gt: 0 } }, { reopenedAt: { gte: from, lte: to } }] },
    include: { assignee: userMini, project: { select: { id: true, key: true, name: true } } },
    orderBy: { reopenedAt: 'desc' },
    take: 50,
  });
  const qaStatus = await prisma.task.groupBy({ by: ['qaStatus'], where: { AND: [base, { qaRequired: true }] }, _count: { _all: true } });
  const buckets = dayBuckets(from, to);
  const series = new Map(buckets.map((b) => [b, { passed: 0, failed: 0 }]));
  for (const r of reports) {
    const v = series.get(dayKey(r.submittedAt));
    if (v) r.overallResult === 'PASSED' ? v.passed++ : v.failed++;
  }
  const testerIds = [...new Set(reports.map((r) => r.testerId))];
  const testers = await prisma.user.findMany({ where: { id: { in: testerIds } }, select: userMini.select });
  res.json({
    range: { from, to },
    passed: reports.filter((r) => r.overallResult === 'PASSED').length,
    failed: reports.filter((r) => r.overallResult === 'FAILED').length,
    overTime: [...series.entries()].map(([date, v]) => ({ date, ...v })),
    currentQaStatus: Object.fromEntries(qaStatus.map((q) => [q.qaStatus, q._count._all])),
    byTester: testers.map((t) => ({
      user: t,
      passed: reports.filter((r) => r.testerId === t.id && r.overallResult === 'PASSED').length,
      failed: reports.filter((r) => r.testerId === t.id && r.overallResult === 'FAILED').length,
    })),
    reopenedTasks: reopenedTasks.map((t) => ({
      id: t.id,
      key: `${t.project.key}-${t.number}`,
      title: t.title,
      reopenCount: t.reopenCount,
      reopenedAt: t.reopenedAt,
      qaStatus: t.qaStatus,
      status: t.status,
      assignee: t.assignee,
      project: t.project,
    })),
  });
});

/** Objective activity counts per person (no scores or rankings). */
reportsRouter.get('/activity', async (req, res) => {
  const user = me(req);
  const { from, to, projectId } = await resolveFilters(user, req.query);
  const events = await prisma.activityEvent.groupBy({
    by: ['actorId', 'eventType'],
    where: {
      createdAt: { gte: from, lte: to },
      actorId: { not: null },
      project: { ...projectScope(user), ...(projectId ? { id: projectId } : {}) },
      eventType: {
        in: ['STATUS_CHANGED', 'SUBMITTED_FOR_QA', 'RESUBMITTED_FOR_QA', 'COMMENT_ADDED', 'ATTACHMENT_UPLOADED', 'QA_PASSED', 'QA_FAILED', 'TASK_CREATED'],
      },
    },
    _count: { _all: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(events.map((e) => e.actorId!))] } },
    select: userMini.select,
  });
  const count = (uid: string, type: string) => events.find((e) => e.actorId === uid && e.eventType === type)?._count._all ?? 0;
  res.json({
    range: { from, to },
    people: users
      .map((u) => ({
        user: u,
        tasksCreated: count(u.id, 'TASK_CREATED'),
        statusChanges: count(u.id, 'STATUS_CHANGED'),
        submittedForQa: count(u.id, 'SUBMITTED_FOR_QA') + count(u.id, 'RESUBMITTED_FOR_QA'),
        qaPassed: count(u.id, 'QA_PASSED'),
        qaFailed: count(u.id, 'QA_FAILED'),
        comments: count(u.id, 'COMMENT_ADDED'),
        uploads: count(u.id, 'ATTACHMENT_UPLOADED'),
      }))
      .sort((a, b) => a.user.name.localeCompare(b.user.name)),
  });
});
