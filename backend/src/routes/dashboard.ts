import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { me } from '../middleware/auth';
import { projectScope, taskScope } from '../services/access';
import { serializeTask, taskCardInclude, userMini } from '../services/serializers';
import { taskSnapshot } from './reports';

export const dashboardRouter = Router();

const DAY = 24 * 60 * 60 * 1000;

/** Role-aware dashboard; every number is computed from the database. */
dashboardRouter.get('/', async (req, res) => {
  const user = me(req);
  const base: Prisma.TaskWhereInput = { AND: [taskScope(user), { archivedAt: null, project: { archivedAt: null } }] };
  const open = { status: { not: 'DONE' as const } };
  const now = new Date();

  const [snapshot, projectsCount, recentActivity, upcoming, recentProjects, myTasks] = await Promise.all([
    taskSnapshot(base),
    prisma.project.count({ where: { ...projectScope(user), archivedAt: null } }),
    prisma.activityEvent.findMany({
      where: user.role === 'ADMIN' ? {} : { project: projectScope(user) },
      include: {
        actor: userMini,
        task: { select: { id: true, title: true, number: true } },
        project: { select: { id: true, name: true, key: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.task.findMany({
      where: {
        AND: [
          base,
          open,
          { dueDate: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 14 * DAY) } },
          user.role === 'ADMIN' || user.role === 'MANAGER' ? {} : { OR: [{ assigneeId: user.id }, { qaAssigneeId: user.id }] },
        ],
      },
      include: taskCardInclude,
      orderBy: { dueDate: 'asc' },
      take: 8,
    }),
    prisma.project.findMany({
      where: { ...projectScope(user), archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, name: true, key: true, color: true, status: true, updatedAt: true },
    }),
    prisma.task.findMany({
      where: { AND: [base, open, { assigneeId: user.id }] },
      include: taskCardInclude,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
      take: 8,
    }),
  ]);

  const result: Record<string, unknown> = {
    role: user.role,
    summary: { projects: projectsCount, ...snapshot },
    recentActivity,
    upcoming: upcoming.map(serializeTask),
    recentProjects,
    myTasks: myTasks.map(serializeTask),
  };

  const qaCounts = async (where: Prisma.QAReportWhereInput = {}) => {
    const g = await prisma.qAReport.groupBy({ by: ['overallResult'], where: { task: base, ...where }, _count: { _all: true } });
    return {
      passed: g.find((x) => x.overallResult === 'PASSED')?._count._all ?? 0,
      failed: g.find((x) => x.overallResult === 'FAILED')?._count._all ?? 0,
    };
  };

  if (user.role === 'ADMIN') {
    const [usersByRole, projects, overdue] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], where: { isActive: true }, _count: { _all: true } }),
      prisma.project.findMany({ where: { archivedAt: null }, select: { id: true, name: true, key: true, color: true }, take: 10, orderBy: { updatedAt: 'desc' } }),
      prisma.task.findMany({ where: { AND: [base, open, { dueDate: { lt: now } }] }, include: taskCardInclude, orderBy: { dueDate: 'asc' }, take: 8 }),
    ]);
    const progress = await prisma.task.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: projects.map((p) => p.id) }, archivedAt: null },
      _count: { _all: true },
    });
    result.admin = {
      usersByRole: Object.fromEntries(usersByRole.map((u) => [u.role, u._count._all])),
      projectProgress: projects.map((p) => {
        const c = (s: string) => progress.find((g) => g.projectId === p.id && g.status === s)?._count._all ?? 0;
        const total = c('TODO') + c('IN_PROGRESS') + c('DONE');
        return { project: p, total, done: c('DONE'), progress: total ? Math.round((c('DONE') / total) * 100) : 0 };
      }),
      overdue: overdue.map(serializeTask),
      qa: await qaCounts(),
    };
  }

  if (user.role === 'MANAGER') {
    const managed = await prisma.project.findMany({
      where: { archivedAt: null, OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
      select: { id: true, name: true, key: true, color: true, status: true },
    });
    const [workload, atRisk, waitingQa, qaFailures] = await Promise.all([
      prisma.task.groupBy({ by: ['assigneeId', 'status'], where: { AND: [base, open, { assigneeId: { not: null } }] }, _count: { _all: true } }),
      prisma.task.findMany({
        where: { AND: [base, open, { OR: [{ dueDate: { lt: now } }, { priority: 'URGENT' }, { qaStatus: 'FAILED' }] }] },
        include: taskCardInclude,
        orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
        take: 8,
      }),
      prisma.task.findMany({ where: { AND: [base, { qaStatus: { in: ['AWAITING_QA', 'IN_TESTING'] } }] }, include: taskCardInclude, take: 8 }),
      prisma.task.findMany({
        where: { AND: [base, open, { OR: [{ qaStatus: 'FAILED' }, { reopenCount: { gt: 0 } }] }] },
        include: taskCardInclude,
        orderBy: { reopenedAt: 'desc' },
        take: 8,
      }),
    ]);
    const people = await prisma.user.findMany({ where: { id: { in: [...new Set(workload.map((w) => w.assigneeId!))] } }, select: userMini.select });
    result.manager = {
      managedProjects: managed,
      workload: people.map((p) => ({
        user: p,
        todo: workload.find((w) => w.assigneeId === p.id && w.status === 'TODO')?._count._all ?? 0,
        inProgress: workload.find((w) => w.assigneeId === p.id && w.status === 'IN_PROGRESS')?._count._all ?? 0,
      })),
      atRisk: atRisk.map(serializeTask),
      waitingForQa: waitingQa.map(serializeTask),
      qaFailures: qaFailures.map(serializeTask),
    };
  }

  if (user.role === 'QA') {
    const [awaiting, mine, reopened, recentReports] = await Promise.all([
      prisma.task.findMany({ where: { AND: [base, { qaStatus: 'AWAITING_QA' }] }, include: taskCardInclude, orderBy: { submittedAt: 'asc' }, take: 10 }),
      prisma.task.findMany({
        where: { AND: [base, { qaAssigneeId: user.id, qaStatus: { in: ['AWAITING_QA', 'IN_TESTING'] } }] },
        include: taskCardInclude,
        take: 10,
      }),
      prisma.task.findMany({ where: { AND: [base, open, { reopenCount: { gt: 0 } }] }, include: taskCardInclude, orderBy: { reopenedAt: 'desc' }, take: 8 }),
      prisma.qAReport.findMany({
        where: { task: base },
        include: { tester: userMini, task: { select: { id: true, title: true, number: true, project: { select: { key: true } } } } },
        orderBy: { submittedAt: 'desc' },
        take: 8,
      }),
    ]);
    result.qa = {
      awaitingTesting: awaiting.map(serializeTask),
      myTestTasks: mine.map(serializeTask),
      reopened: reopened.map(serializeTask),
      recentReports,
      myResults: await qaCounts({ testerId: user.id }),
      allResults: await qaCounts(),
    };
  }

  if (user.role === 'DEVELOPER') {
    const mineBase = { AND: [base, { assigneeId: user.id }] };
    const [byStatus, returned, reopened, recentComments] = await Promise.all([
      prisma.task.groupBy({ by: ['status'], where: mineBase, _count: { _all: true } }),
      prisma.task.findMany({ where: { AND: [mineBase, { qaStatus: 'FAILED' }] }, include: taskCardInclude, orderBy: { reopenedAt: 'desc' }, take: 8 }),
      prisma.task.count({ where: { AND: [mineBase, open, { reopenCount: { gt: 0 } }] } }),
      prisma.comment.findMany({
        where: { deletedAt: null, authorId: { not: user.id }, task: { AND: [base, { OR: [{ assigneeId: user.id }, { reporterId: user.id }] }] } },
        include: { author: userMini, task: { select: { id: true, title: true, number: true, project: { select: { key: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);
    const c = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    result.developer = {
      mine: { todo: c('TODO'), inProgress: c('IN_PROGRESS'), done: c('DONE'), reopened },
      returnedByQa: returned.map(serializeTask),
      recentComments,
    };
  }

  res.json(result);
});
