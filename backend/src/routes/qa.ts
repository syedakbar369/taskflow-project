import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { pagination, param, parse } from '../lib/validate';
import { badRequest, forbidden, notFound, unprocessable } from '../lib/errors';
import { me, requireRole } from '../middleware/auth';
import { assertTaskAccess, canManageProject, projectManagerIds, taskScope } from '../services/access';
import { logActivity } from '../services/activity';
import { notifyUsers } from '../services/notify';
import { broadcastProject } from '../services/realtime';
import { storage } from '../services/storage';
import { serializeTask, taskCardInclude, userMini } from '../services/serializers';
import { storeFiles, upload } from './attachments';
import { taskPermissions } from './tasks';

export const qaRouter = Router();
export const taskQaReportsRouter = Router({ mergeParams: true });
export const qaReportsRouter = Router();

const reportInclude = {
  tester: userMini,
  testCases: { orderBy: { order: 'asc' } },
  attachments: { include: { uploader: userMini } },
  task: { select: { id: true, title: true, number: true, project: { select: { id: true, key: true, name: true } } } },
} satisfies Prisma.QAReportInclude;

const testCaseSchema = z.object({
  title: z.string().trim().min(1, 'Test case title is required').max(200),
  steps: z.string().trim().max(5000).optional().nullable(),
  expectedResult: z.string().trim().max(2000).optional().nullable(),
  actualResult: z.string().trim().max(2000).optional().nullable(),
  result: z.enum(['PASSED', 'FAILED']),
});

const reportSchema = z
  .object({
    title: z.string().trim().min(2, 'Report title is required').max(200),
    summary: z.string().trim().min(3, 'Test summary is required').max(10000),
    overallResult: z.enum(['PASSED', 'FAILED']),
    notes: z.string().trim().max(10000).optional().nullable(),
    testCases: z.array(testCaseSchema).min(1, 'Add at least one test case').max(50),
  })
  .superRefine((r, ctx) => {
    const failed = r.testCases.filter((t) => t.result === 'FAILED');
    if (r.overallResult === 'PASSED' && failed.length) {
      ctx.addIssue({ code: 'custom', path: ['overallResult'], message: 'A report with failed test cases cannot pass' });
    }
    if (r.overallResult === 'FAILED' && failed.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['testCases'], message: 'Mark at least one test case as failed and describe the failure' });
    }
    if (r.overallResult === 'FAILED' && failed.some((t) => !t.actualResult)) {
      ctx.addIssue({ code: 'custom', path: ['testCases'], message: 'Describe the actual result for every failed test case' });
    }
  });

// ---------------------------------------------------------------------------
// QA queue & report history (QA Center)
// ---------------------------------------------------------------------------
qaRouter.get('/queue', requireRole('QA', 'ADMIN', 'MANAGER'), async (req, res) => {
  const user = me(req);
  const q = parse(
    z.object({
      scope: z.enum(['all', 'mine']).default('all'),
      qaStatus: z.enum(['AWAITING_QA', 'IN_TESTING', 'FAILED', 'PASSED']).optional(),
      projectId: z.string().optional(),
    }),
    req.query,
  );
  const where: Prisma.TaskWhereInput = {
    AND: [
      taskScope(user),
      { archivedAt: null, qaRequired: true, project: { archivedAt: null } },
      q.qaStatus ? { qaStatus: q.qaStatus } : { qaStatus: { in: ['AWAITING_QA', 'IN_TESTING'] } },
      q.scope === 'mine' ? { qaAssigneeId: user.id } : {},
      q.projectId ? { projectId: q.projectId } : {},
    ],
  };
  const items = await prisma.task.findMany({
    where,
    include: { ...taskCardInclude, submittedBy: userMini },
    orderBy: [{ submittedAt: { sort: 'asc', nulls: 'last' } }],
    take: 200,
  });
  const counts = await prisma.task.groupBy({
    by: ['qaStatus'],
    where: { AND: [taskScope(user), { archivedAt: null, qaRequired: true, project: { archivedAt: null } }] },
    _count: { _all: true },
  });
  res.json({
    items: items.map(serializeTask),
    counts: Object.fromEntries(counts.map((c) => [c.qaStatus, c._count._all])),
  });
});

qaRouter.get('/reports', requireRole('QA', 'ADMIN', 'MANAGER', 'DEVELOPER'), async (req, res) => {
  const user = me(req);
  const q = parse(
    pagination.extend({
      result: z.enum(['PASSED', 'FAILED']).optional(),
      projectId: z.string().optional(),
      testerId: z.string().optional(),
    }),
    req.query,
  );
  const where: Prisma.QAReportWhereInput = {
    task: { AND: [taskScope(user), q.projectId ? { projectId: q.projectId } : {}] },
    ...(q.result ? { overallResult: q.result } : {}),
    ...(q.testerId ? { testerId: q.testerId === 'me' ? user.id : q.testerId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.qAReport.findMany({
      where,
      include: { ...reportInclude, _count: { select: { testCases: true, attachments: true } } },
      orderBy: { submittedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.qAReport.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

// ---------------------------------------------------------------------------
// Reports per task (chronological, never overwritten)
// ---------------------------------------------------------------------------
taskQaReportsRouter.get('/', async (req, res) => {
  const task = await assertTaskAccess(me(req), param((req.params as Record<string, string>).taskId));
  const items = await prisma.qAReport.findMany({
    where: { taskId: task.id },
    include: reportInclude,
    orderBy: { submittedAt: 'asc' },
  });
  res.json({ items });
});

/**
 * Submit an immutable QA report. Accepts JSON or multipart (field `data` = JSON, `files` = evidence).
 * PASSED  -> qaStatus PASSED, task automatically moves to Done (documented behaviour).
 * FAILED  -> qaStatus FAILED, task returns to In Progress for the Developer, reopen counters updated.
 */
taskQaReportsRouter.post('/', upload.array('files', 10), async (req, res) => {
  const user = me(req);
  const task = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  if (user.role !== 'QA' && user.role !== 'ADMIN') throw forbidden('Only QA testers can submit test reports');
  let raw: unknown = req.body;
  if (typeof req.body?.data === 'string') {
    try {
      raw = JSON.parse(req.body.data);
    } catch {
      throw badRequest('Malformed report data');
    }
  }
  const body = parse(reportSchema, raw);
  if (!task.qaRequired) throw unprocessable('This task does not require QA');
  if (task.assigneeId === user.id || task.submittedById === user.id) {
    throw forbidden('You cannot test and approve your own work');
  }
  const perms = taskPermissions(user, task, await canManageProject(user, task.projectId));
  if (!perms.canSubmitQaReport) {
    throw unprocessable(
      task.qaStatus === 'FAILED'
        ? 'This task already failed QA and is waiting for the Developer to resubmit a fix'
        : 'This task has not been submitted for QA yet',
    );
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const stored = files.length ? await storeFiles(files) : [];
  const passed = body.overallResult === 'PASSED';
  const now = new Date();
  let reportId: string;
  try {
    reportId = await prisma.$transaction(async (tx) => {
      const report = await tx.qAReport.create({
        data: {
          taskId: task.id,
          testerId: user.id,
          title: body.title,
          summary: body.summary,
          overallResult: body.overallResult,
          notes: body.notes ?? null,
          submittedAt: now,
          testCases: {
            create: body.testCases.map((tc, i) => ({
              title: tc.title,
              steps: tc.steps ?? null,
              expectedResult: tc.expectedResult ?? null,
              actualResult: tc.actualResult ?? null,
              result: tc.result,
              order: i,
            })),
          },
        },
      });
      for (const s of stored) {
        await tx.attachment.create({ data: { ...s, taskId: task.id, qaReportId: report.id, uploaderId: user.id } });
      }
      const lastDone = await tx.task.findFirst({
        where: { projectId: task.projectId, status: 'DONE' },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      await tx.task.update({
        where: { id: task.id },
        data: passed
          ? {
              qaStatus: 'PASSED',
              status: 'DONE',
              completedAt: now,
              qaApprovedById: user.id,
              qaApprovedAt: now,
              qaAssigneeId: task.qaAssigneeId ?? user.id,
              position: task.status === 'DONE' ? task.position : (lastDone?.position ?? 0) + 1000,
            }
          : {
              qaStatus: 'FAILED',
              status: 'IN_PROGRESS',
              completedAt: null,
              qaApprovedById: null,
              qaApprovedAt: null,
              reopenedAt: now,
              reopenCount: { increment: 1 },
              qaAssigneeId: task.qaAssigneeId ?? user.id,
              // Return the task to the responsible Developer.
              assigneeId: task.assigneeId ?? task.submittedById,
            },
      });
      const base = { actorId: user.id, projectId: task.projectId, taskId: task.id };
      await logActivity(tx, {
        ...base,
        eventType: 'QA_REPORT_SUBMITTED',
        details: { reportId: report.id, title: report.title, result: body.overallResult, evidence: stored.length },
      });
      await logActivity(tx, {
        ...base,
        eventType: passed ? 'QA_PASSED' : 'QA_FAILED',
        details: {
          reportId: report.id,
          failedCases: body.testCases.filter((t) => t.result === 'FAILED').map((t) => t.title),
        },
      });
      if (task.status !== (passed ? 'DONE' : 'IN_PROGRESS')) {
        await logActivity(tx, { ...base, eventType: 'STATUS_CHANGED', details: { from: task.status, to: passed ? 'DONE' : 'IN_PROGRESS' } });
      }
      if (!passed) await logActivity(tx, { ...base, eventType: 'TASK_REOPENED', details: { reason: 'QA failed', reportId: report.id } });
      return report.id;
    });
  } catch (e) {
    await Promise.all(stored.map((s) => storage.remove(s.storageKey)));
    throw e;
  }

  const key = `${task.project.key}-${task.number}`;
  const developer = task.assigneeId ?? task.submittedById;
  await notifyUsers([developer, task.submittedById, task.reporterId, ...(await projectManagerIds(task.projectId))], {
    actorId: user.id,
    type: passed ? 'QA_PASSED' : 'QA_FAILED',
    title: passed ? 'QA passed' : 'QA failed — task reopened',
    message: passed
      ? `${user.name} approved ${key}: ${task.title}. It is now Done.`
      : `${user.name} failed ${key}: ${task.title}. ${body.summary.slice(0, 120)}`,
    projectId: task.projectId,
    taskId: task.id,
  });
  broadcastProject({ type: 'qa.report', projectId: task.projectId, taskId: task.id, actorId: user.id });
  const report = await prisma.qAReport.findUniqueOrThrow({ where: { id: reportId }, include: reportInclude });
  res.status(201).json({ report });
});

qaReportsRouter.get('/:reportId', async (req, res) => {
  const report = await prisma.qAReport.findUnique({ where: { id: param(req.params.reportId) }, include: reportInclude });
  if (!report) throw notFound('Report not found');
  await assertTaskAccess(me(req), report.taskId);
  res.json({ report });
});
