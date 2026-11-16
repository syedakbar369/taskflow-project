import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, Task, TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { optionalDate, pagination, param, parse } from '../lib/validate';
import { badRequest, forbidden, unprocessable } from '../lib/errors';
import { me, type AuthUser } from '../middleware/auth';
import {
  assertAssignable,
  assertCanManageProject,
  assertProjectAccess,
  assertTaskAccess,
  canManageProject,
  projectManagerIds,
  projectQaIds,
  taskScope,
} from '../services/access';
import { logActivity, type Tx } from '../services/activity';
import { notifyUsers } from '../services/notify';
import { broadcastProject } from '../services/realtime';
import { serializeTask, taskCardInclude, taskDetailInclude, userMini } from '../services/serializers';

export const projectTasksRouter = Router({ mergeParams: true });
export const tasksRouter = Router();

const statusEnum = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);
const priorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const qaStatusEnum = z.enum(['NOT_REQUIRED', 'PENDING', 'AWAITING_QA', 'IN_TESTING', 'PASSED', 'FAILED']);
const csv = <T extends z.ZodTypeAny>(item: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(item).optional());

const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done' };

// ---------------------------------------------------------------------------
// Filters (shared by project board and global task search)
// ---------------------------------------------------------------------------
const filterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: csv(statusEnum),
  priority: csv(priorityEnum),
  qaStatus: csv(qaStatusEnum),
  assigneeId: z.string().optional(),
  qaAssigneeId: z.string().optional(),
  labelId: z.string().optional(),
  projectId: z.string().optional(),
  reopened: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  dueFrom: optionalDate,
  dueTo: optionalDate,
});
type Filters = z.infer<typeof filterSchema>;

function buildWhere(user: AuthUser, f: Filters): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [taskScope(user), { archivedAt: null }, { project: { archivedAt: null } }];
  if (f.projectId) and.push({ projectId: f.projectId });
  if (f.status?.length) and.push({ status: { in: f.status } });
  if (f.priority?.length) and.push({ priority: { in: f.priority } });
  if (f.qaStatus?.length) and.push({ qaStatus: { in: f.qaStatus } });
  if (f.assigneeId) and.push({ assigneeId: f.assigneeId === 'me' ? user.id : f.assigneeId === 'unassigned' ? null : f.assigneeId });
  if (f.qaAssigneeId) and.push({ qaAssigneeId: f.qaAssigneeId === 'me' ? user.id : f.qaAssigneeId });
  if (f.labelId) and.push({ labels: { some: { labelId: f.labelId } } });
  if (f.reopened === 'true') and.push({ reopenCount: { gt: 0 } });
  if (f.reopened === 'false') and.push({ reopenCount: 0 });
  if (f.overdue === 'true') and.push({ dueDate: { lt: new Date() }, status: { not: 'DONE' } });
  if (f.dueFrom) and.push({ dueDate: { gte: f.dueFrom } });
  if (f.dueTo) and.push({ dueDate: { lte: f.dueTo } });
  if (f.q) {
    const keyMatch = f.q.match(/^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/);
    and.push({
      OR: [
        { title: { contains: f.q, mode: 'insensitive' } },
        { description: { contains: f.q, mode: 'insensitive' } },
        ...(keyMatch ? [{ project: { key: keyMatch[1]!.toUpperCase() }, number: Number(keyMatch[2]) }] : []),
      ],
    });
  }
  return { AND: and };
}

// ---------------------------------------------------------------------------
// Permission model for a task (returned to UI; the same rules are enforced in each handler)
// ---------------------------------------------------------------------------
export function taskPermissions(user: AuthUser, task: Pick<Task, 'assigneeId' | 'submittedById' | 'qaRequired' | 'qaStatus' | 'status'>, canManage: boolean) {
  const isAssignee = task.assigneeId === user.id;
  const isTester = user.role === 'QA' || user.role === 'ADMIN';
  const ownWork = task.assigneeId === user.id || task.submittedById === user.id;
  const worker = canManage || (isAssignee && user.role !== 'QA');
  return {
    canEdit: canManage,
    canAssign: canManage,
    canArchive: canManage,
    canMove: worker,
    canComplete: worker && (!task.qaRequired || task.qaStatus === 'PASSED'),
    canSubmitForQa: worker && task.qaRequired && task.qaStatus === 'PENDING' && task.status !== 'DONE',
    canResubmitForQa: worker && task.qaRequired && task.qaStatus === 'FAILED',
    canStartTesting: isTester && !ownWork && task.qaStatus === 'AWAITING_QA',
    canSubmitQaReport: isTester && !ownWork && task.qaRequired && ['AWAITING_QA', 'IN_TESTING', 'PASSED'].includes(task.qaStatus),
    canComment: true,
    canUpload: true,
  };
}

async function nextPosition(tx: Tx, projectId: string, status: TaskStatus) {
  const last = await tx.task.findFirst({ where: { projectId, status }, orderBy: { position: 'desc' }, select: { position: true } });
  return (last?.position ?? 0) + 1000;
}

async function loadTask(id: string) {
  const t = await prisma.task.findUniqueOrThrow({ where: { id }, include: taskDetailInclude });
  return serializeTask(t);
}

// ---------------------------------------------------------------------------
// Project-scoped: list + create
// ---------------------------------------------------------------------------
projectTasksRouter.get('/', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  await assertProjectAccess(user, projectId);
  const f = parse(filterSchema, req.query);
  const where = buildWhere(user, { ...f, projectId });
  const tasks = await prisma.task.findMany({
    where,
    include: taskCardInclude,
    orderBy: [{ status: 'asc' }, { position: 'asc' }],
    take: 1000,
  });
  res.json({ items: tasks.map(serializeTask) });
});

const createSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(20000).nullable().optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.default('MEDIUM'),
  assigneeId: z.string().nullable().optional(),
  qaAssigneeId: z.string().nullable().optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
  qaRequired: z.boolean().default(false),
  labelIds: z.array(z.string()).max(20).default([]),
});

projectTasksRouter.post('/', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  const project = await assertCanManageProject(user, projectId);
  if (project.archivedAt) throw badRequest('This project is archived');
  const body = parse(createSchema, req.body);
  if (body.status === 'DONE' && body.qaRequired) throw unprocessable('A QA-required task cannot be created as Done');
  if (body.assigneeId) await assertAssignable(projectId, body.assigneeId);
  if (body.qaAssigneeId) await assertAssignable(projectId, body.qaAssigneeId, ['QA', 'ADMIN'], 'QA assignee');
  if (body.labelIds.length && (await prisma.label.count({ where: { id: { in: body.labelIds } } })) !== body.labelIds.length) {
    throw badRequest('One or more labels do not exist');
  }
  if (body.startDate && body.dueDate && body.dueDate < body.startDate) throw badRequest('Due date must be after start date');

  const created = await prisma.$transaction(async (tx) => {
    const { taskCounter } = await tx.project.update({ where: { id: projectId }, data: { taskCounter: { increment: 1 } } });
    const status = body.status ?? 'TODO';
    const t = await tx.task.create({
      data: {
        projectId,
        number: taskCounter,
        title: body.title,
        description: body.description ?? null,
        status,
        priority: body.priority,
        position: await nextPosition(tx, projectId, status),
        assigneeId: body.assigneeId ?? null,
        qaAssigneeId: body.qaAssigneeId ?? null,
        reporterId: user.id,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        qaRequired: body.qaRequired,
        qaStatus: body.qaRequired ? 'PENDING' : 'NOT_REQUIRED',
        completedAt: status === 'DONE' ? new Date() : null,
        labels: { create: body.labelIds.map((labelId) => ({ labelId })) },
      },
    });
    await logActivity(tx, {
      actorId: user.id,
      eventType: 'TASK_CREATED',
      projectId,
      taskId: t.id,
      details: { title: t.title, key: `${project.key}-${t.number}`, priority: t.priority, qaRequired: t.qaRequired },
    });
    return t;
  });
  const key = `${project.key}-${created.number}`;
  await notifyUsers([created.assigneeId], {
    actorId: user.id,
    type: 'TASK_ASSIGNED',
    title: 'New task assigned',
    message: `${user.name} assigned you ${key}: ${created.title}`,
    projectId,
    taskId: created.id,
  });
  await notifyUsers([created.qaAssigneeId], {
    actorId: user.id,
    type: 'QA_ASSIGNED',
    title: 'You are the QA tester',
    message: `${user.name} made you QA tester for ${key}: ${created.title}`,
    projectId,
    taskId: created.id,
  });
  broadcastProject({ type: 'task.created', projectId, taskId: created.id, actorId: user.id });
  res.status(201).json({ task: await loadTask(created.id) });
});

// ---------------------------------------------------------------------------
// Global task search / My Tasks
// ---------------------------------------------------------------------------
tasksRouter.get('/', async (req, res) => {
  const user = me(req);
  const q = parse(
    filterSchema.merge(pagination).extend({
      sort: z.enum(['updated', 'due', 'priority', 'created']).default('updated'),
    }),
    req.query,
  );
  const where = buildWhere(user, q);
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    q.sort === 'due'
      ? [{ dueDate: { sort: 'asc', nulls: 'last' } }]
      : q.sort === 'priority'
        ? [{ priority: 'desc' }, { updatedAt: 'desc' }]
        : q.sort === 'created'
          ? [{ createdAt: 'desc' }]
          : [{ updatedAt: 'desc' }];
  const [items, total] = await Promise.all([
    prisma.task.findMany({ where, include: taskCardInclude, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.task.count({ where }),
  ]);
  res.json({ items: items.map(serializeTask), total, page: q.page, pageSize: q.pageSize });
});

tasksRouter.get('/:taskId', async (req, res) => {
  const user = me(req);
  const task = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  const full = await loadTask(task.id);
  const canManage = await canManageProject(user, task.projectId);
  const members = await prisma.projectMember.findMany({
    where: { projectId: task.projectId, user: { isActive: true } },
    select: { user: userMini },
    orderBy: { user: { name: 'asc' } },
  });
  res.json({
    task: full,
    permissions: taskPermissions(user, task, canManage),
    members: members.map((m) => m.user),
  });
});

// ---------------------------------------------------------------------------
// Edit fields
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20000).nullable().optional(),
  priority: priorityEnum.optional(),
  assigneeId: z.string().nullable().optional(),
  qaAssigneeId: z.string().nullable().optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
  qaRequired: z.boolean().optional(),
  labelIds: z.array(z.string()).max(20).optional(),
});

tasksRouter.patch('/:taskId', async (req, res) => {
  const user = me(req);
  const before = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  if (!(await canManageProject(user, before.projectId))) throw forbidden('Only Admins and project Managers can edit task details');
  const body = parse(updateSchema, req.body);
  const projectId = before.projectId;
  if (body.assigneeId) await assertAssignable(projectId, body.assigneeId);
  if (body.qaAssigneeId) await assertAssignable(projectId, body.qaAssigneeId, ['QA', 'ADMIN'], 'QA assignee');
  if (body.labelIds && (await prisma.label.count({ where: { id: { in: body.labelIds } } })) !== body.labelIds.length) {
    throw badRequest('One or more labels do not exist');
  }
  const beforeLabels = (await prisma.taskLabel.findMany({ where: { taskId: before.id }, include: { label: true } })).map((l) => l.label.name);

  await prisma.$transaction(async (tx) => {
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
    if (body.qaAssigneeId !== undefined) data.qaAssigneeId = body.qaAssigneeId;
    if (body.startDate !== undefined) data.startDate = body.startDate;
    if (body.dueDate !== undefined) {
      data.dueDate = body.dueDate;
      data.dueSoonNotifiedAt = null;
      data.overdueNotifiedAt = null;
    }
    if (body.qaRequired !== undefined && body.qaRequired !== before.qaRequired) {
      if (body.qaRequired && before.status === 'DONE') throw unprocessable('Move the task out of Done before requiring QA');
      data.qaRequired = body.qaRequired;
      data.qaStatus = body.qaRequired ? 'PENDING' : 'NOT_REQUIRED';
    }
    if (body.labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId: before.id } });
      await tx.taskLabel.createMany({ data: body.labelIds.map((labelId) => ({ taskId: before.id, labelId })) });
    }
    const after = await tx.task.update({ where: { id: before.id }, data });

    const base = { actorId: user.id, projectId, taskId: before.id };
    if (body.assigneeId !== undefined && body.assigneeId !== before.assigneeId) {
      await logActivity(tx, { ...base, eventType: 'ASSIGNEE_CHANGED', details: { from: before.assigneeId, to: after.assigneeId } });
    }
    if (body.qaAssigneeId !== undefined && body.qaAssigneeId !== before.qaAssigneeId) {
      await logActivity(tx, { ...base, eventType: 'QA_ASSIGNEE_CHANGED', details: { from: before.qaAssigneeId, to: after.qaAssigneeId } });
    }
    if (body.priority && body.priority !== before.priority) {
      await logActivity(tx, { ...base, eventType: 'PRIORITY_CHANGED', details: { from: before.priority, to: after.priority } });
    }
    if (body.dueDate !== undefined && before.dueDate?.getTime() !== after.dueDate?.getTime()) {
      await logActivity(tx, { ...base, eventType: 'DUE_DATE_CHANGED', details: { from: before.dueDate, to: after.dueDate } });
    }
    if (body.labelIds) {
      const names = (await tx.label.findMany({ where: { id: { in: body.labelIds } } })).map((l) => l.name);
      if (names.sort().join() !== beforeLabels.sort().join()) {
        await logActivity(tx, { ...base, eventType: 'LABELS_CHANGED', details: { from: beforeLabels, to: names } });
      }
    }
    const other: Record<string, { from: unknown; to: unknown }> = {};
    if (body.title !== undefined && body.title !== before.title) other.title = { from: before.title, to: after.title };
    if (body.description !== undefined && body.description !== before.description) other.description = { from: '(previous)', to: '(updated)' };
    if (data.qaRequired !== undefined) other.qaRequired = { from: before.qaRequired, to: after.qaRequired };
    if (body.startDate !== undefined && before.startDate?.getTime() !== after.startDate?.getTime()) {
      other.startDate = { from: before.startDate, to: after.startDate };
    }
    if (Object.keys(other).length) await logActivity(tx, { ...base, eventType: 'TASK_UPDATED', details: other as Prisma.InputJsonValue });
  });

  const task = await loadTask(before.id);
  if (body.assigneeId && body.assigneeId !== before.assigneeId) {
    await notifyUsers([body.assigneeId], {
      actorId: user.id,
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      message: `${user.name} assigned you ${task.key}: ${task.title}`,
      projectId,
      taskId: task.id,
    });
  }
  if (body.qaAssigneeId && body.qaAssigneeId !== before.qaAssigneeId) {
    await notifyUsers([body.qaAssigneeId], {
      actorId: user.id,
      type: 'QA_ASSIGNED',
      title: 'You are the QA tester',
      message: `${user.name} made you QA tester for ${task.key}: ${task.title}`,
      projectId,
      taskId: task.id,
    });
  }
  broadcastProject({ type: 'task.updated', projectId, taskId: task.id, actorId: user.id });
  res.json({ task });
});

// ---------------------------------------------------------------------------
// Status changes (drag & drop)
// ---------------------------------------------------------------------------
tasksRouter.patch('/:taskId/status', async (req, res) => {
  const user = me(req);
  const before = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  const body = parse(z.object({ status: statusEnum, position: z.number().finite().optional() }), req.body);
  const canManage = await canManageProject(user, before.projectId);
  const perms = taskPermissions(user, before, canManage);

  if (user.role === 'QA' && !canManage) {
    throw forbidden('QA updates task status through test reports (Pass/Fail) in the QA & Test Reports tab');
  }
  if (!perms.canMove) throw forbidden('Only the assignee or a project Manager can move this task');
  if (body.status === 'DONE' && before.status !== 'DONE' && before.qaRequired && before.qaStatus !== 'PASSED') {
    throw unprocessable('This task requires QA approval before it can be marked Done. Use "Submit for QA" instead.');
  }

  const statusChanged = body.status !== before.status;
  await prisma.$transaction(async (tx) => {
    const data: Prisma.TaskUncheckedUpdateInput = {
      status: body.status,
      position: body.position ?? (statusChanged ? await nextPosition(tx, before.projectId, body.status) : before.position),
    };
    if (statusChanged) {
      data.completedAt = body.status === 'DONE' ? new Date() : null;
      // Moving a QA-approved task out of Done reopens it and requires a fresh QA cycle.
      if (before.status === 'DONE' && before.qaRequired) {
        data.qaStatus = 'PENDING';
        data.reopenedAt = new Date();
        data.reopenCount = { increment: 1 };
        data.qaApprovedAt = null;
        data.qaApprovedById = null;
      }
    }
    await tx.task.update({ where: { id: before.id }, data });
    if (statusChanged) {
      const base = { actorId: user.id, projectId: before.projectId, taskId: before.id };
      await logActivity(tx, {
        ...base,
        eventType: 'STATUS_CHANGED',
        details: { from: before.status, to: body.status },
      });
      if (before.status === 'DONE' && before.qaRequired) {
        await logActivity(tx, { ...base, eventType: 'TASK_REOPENED', details: { reason: 'Moved out of Done' } });
      }
    }
  });

  const task = await loadTask(before.id);
  if (statusChanged) {
    const recipients = [before.assigneeId, before.reporterId];
    await notifyUsers(recipients, {
      actorId: user.id,
      type: 'TASK_STATUS_CHANGED',
      title: `Moved to ${STATUS_LABEL[body.status]}`,
      message: `${user.name} moved ${task.key}: ${task.title} to ${STATUS_LABEL[body.status]}`,
      projectId: before.projectId,
      taskId: before.id,
    });
  }
  broadcastProject({ type: 'task.moved', projectId: before.projectId, taskId: before.id, actorId: user.id });
  res.json({ task });
});

tasksRouter.patch('/:taskId/assignee', async (req, res) => {
  const user = me(req);
  const before = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  if (!(await canManageProject(user, before.projectId))) throw forbidden('Only Admins and project Managers can assign tasks');
  const body = parse(z.object({ assigneeId: z.string().nullable() }), req.body);
  if (body.assigneeId) await assertAssignable(before.projectId, body.assigneeId);
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: before.id }, data: { assigneeId: body.assigneeId } });
    await logActivity(tx, {
      actorId: user.id,
      projectId: before.projectId,
      taskId: before.id,
      eventType: 'ASSIGNEE_CHANGED',
      details: { from: before.assigneeId, to: body.assigneeId },
    });
  });
  const task = await loadTask(before.id);
  if (body.assigneeId && body.assigneeId !== before.assigneeId) {
    await notifyUsers([body.assigneeId], {
      actorId: user.id,
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      message: `${user.name} assigned you ${task.key}: ${task.title}`,
      projectId: before.projectId,
      taskId: before.id,
    });
  }
  broadcastProject({ type: 'task.updated', projectId: before.projectId, taskId: before.id, actorId: user.id });
  res.json({ task });
});

// ---------------------------------------------------------------------------
// QA workflow: submit / resubmit / start testing
// ---------------------------------------------------------------------------
async function submitForQa(user: AuthUser, taskId: string, note: string | undefined, resubmit: boolean) {
  const before = await assertTaskAccess(user, taskId);
  const canManage = await canManageProject(user, before.projectId);
  const perms = taskPermissions(user, before, canManage);
  if (!before.qaRequired) throw unprocessable('This task does not require QA. Move it to Done when finished.');
  if (resubmit) {
    if (before.qaStatus !== 'FAILED') throw unprocessable('Only tasks that failed QA can be resubmitted');
    if (!perms.canResubmitForQa) throw forbidden('Only the assignee or a project Manager can resubmit this task');
  } else {
    if (before.qaStatus === 'FAILED') throw unprocessable('This task failed QA. Use "Resubmit for QA" with a fix note.');
    if (before.qaStatus !== 'PENDING') throw unprocessable('This task has already been submitted for QA');
    if (!perms.canSubmitForQa) throw forbidden('Only the assignee or a project Manager can submit this task for QA');
  }
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: before.id },
      data: {
        qaStatus: 'AWAITING_QA',
        submittedById: user.id,
        submittedAt: new Date(),
        status: before.status === 'TODO' ? 'IN_PROGRESS' : before.status,
      },
    });
    if (note) await tx.comment.create({ data: { taskId: before.id, authorId: user.id, content: note, kind: 'FIX_NOTE' } });
    await logActivity(tx, {
      actorId: user.id,
      projectId: before.projectId,
      taskId: before.id,
      eventType: resubmit ? 'RESUBMITTED_FOR_QA' : 'SUBMITTED_FOR_QA',
      details: note ? { note: note.slice(0, 500) } : undefined,
    });
  });
  const task = await loadTask(before.id);
  const qaRecipients = before.qaAssigneeId ? [before.qaAssigneeId] : await projectQaIds(before.projectId);
  await notifyUsers([...qaRecipients, ...(await projectManagerIds(before.projectId))], {
    actorId: user.id,
    type: resubmit ? 'TASK_RESUBMITTED_FOR_QA' : 'TASK_SUBMITTED_FOR_QA',
    title: resubmit ? 'Fix ready for retest' : 'Ready for QA',
    message: `${user.name} ${resubmit ? 'resubmitted' : 'submitted'} ${task.key}: ${task.title} for QA`,
    projectId: before.projectId,
    taskId: before.id,
  });
  broadcastProject({ type: 'task.qa', projectId: before.projectId, taskId: before.id, actorId: user.id });
  return task;
}

tasksRouter.post('/:taskId/submit-for-qa', async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(5000).optional() }), req.body ?? {});
  res.json({ task: await submitForQa(me(req), param((req.params as Record<string, string>).taskId), body.note || undefined, false) });
});

tasksRouter.post('/:taskId/resubmit-for-qa', async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().min(3, 'Describe the fix you made').max(5000) }), req.body ?? {});
  res.json({ task: await submitForQa(me(req), param((req.params as Record<string, string>).taskId), body.note, true) });
});

tasksRouter.post('/:taskId/start-testing', async (req, res) => {
  const user = me(req);
  const before = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  const perms = taskPermissions(user, before, await canManageProject(user, before.projectId));
  if (!perms.canStartTesting) {
    throw before.qaStatus !== 'AWAITING_QA'
      ? unprocessable('Only tasks awaiting QA can be picked up for testing')
      : forbidden('Only QA testers (not the developer of this task) can start testing');
  }
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: before.id },
      data: { qaStatus: 'IN_TESTING', qaAssigneeId: before.qaAssigneeId ?? user.id },
    });
    await logActivity(tx, { actorId: user.id, projectId: before.projectId, taskId: before.id, eventType: 'QA_TESTING_STARTED' });
  });
  broadcastProject({ type: 'task.qa', projectId: before.projectId, taskId: before.id, actorId: user.id });
  res.json({ task: await loadTask(before.id) });
});

tasksRouter.post('/:taskId/archive', async (req, res) => {
  const user = me(req);
  const before = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  if (!(await canManageProject(user, before.projectId))) throw forbidden('Only Admins and project Managers can archive tasks');
  const restore = req.query.restore === 'true';
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: before.id }, data: { archivedAt: restore ? null : new Date() } });
    await logActivity(tx, {
      actorId: user.id,
      projectId: before.projectId,
      taskId: before.id,
      eventType: 'TASK_ARCHIVED',
      details: { restored: restore },
    });
  });
  broadcastProject({ type: 'task.archived', projectId: before.projectId, taskId: before.id, actorId: user.id });
  res.json({ ok: true });
});

tasksRouter.get('/:taskId/activity', async (req, res) => {
  const user = me(req);
  const task = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  const items = await prisma.activityEvent.findMany({
    where: { taskId: task.id },
    include: { actor: userMini },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ items });
});
