import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { optionalDate, pagination, param, parse } from '../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { me, requireRole } from '../middleware/auth';
import { assertCanManageProject, assertProjectAccess, canManageProject, projectScope } from '../services/access';
import { logActivity } from '../services/activity';
import { notifyUsers } from '../services/notify';
import { broadcastProject, joinAdminsToProject, syncUserProjectRoom } from '../services/realtime';
import { storage } from '../services/storage';
import { userMini } from '../services/serializers';

export const projectsRouter = Router();

const statusEnum = z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']);
const keySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Key must be 2-10 letters/numbers and start with a letter');
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

async function generateKey(name: string) {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .replace(/^[0-9]+/, '')
      .slice(0, 4) || 'PRJ';
  const padded = base.length < 2 ? (name.toUpperCase().replace(/[^A-Z]/g, '') + 'XX').slice(0, 3) : base;
  let key = padded;
  for (let i = 2; await prisma.project.findUnique({ where: { key } }); i++) key = `${padded}${i}`;
  return key;
}

async function projectStats(projectIds: string[]) {
  const grouped = await prisma.task.groupBy({
    by: ['projectId', 'status'],
    where: { projectId: { in: projectIds }, archivedAt: null },
    _count: { _all: true },
  });
  const overdue = await prisma.task.groupBy({
    by: ['projectId'],
    where: { projectId: { in: projectIds }, archivedAt: null, status: { not: 'DONE' }, dueDate: { lt: new Date() } },
    _count: { _all: true },
  });
  return (id: string) => {
    const by = (s: string) => grouped.find((g) => g.projectId === id && g.status === s)?._count._all ?? 0;
    const todo = by('TODO');
    const inProgress = by('IN_PROGRESS');
    const done = by('DONE');
    const total = todo + inProgress + done;
    return {
      total,
      todo,
      inProgress,
      done,
      overdue: overdue.find((o) => o.projectId === id)?._count._all ?? 0,
      progress: total ? Math.round((done / total) * 100) : 0,
    };
  };
}

projectsRouter.get('/', async (req, res) => {
  const q = parse(
    pagination.extend({
      q: z.string().trim().max(100).optional(),
      status: statusEnum.optional(),
      includeArchived: z.enum(['true', 'false']).default('false'),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
    req.query,
  );
  const user = me(req);
  const where: Prisma.ProjectWhereInput = {
    ...projectScope(user),
    ...(q.status ? { status: q.status } : q.includeArchived === 'true' ? {} : { archivedAt: null }),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { description: { contains: q.q, mode: 'insensitive' } },
            { key: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        owner: userMini,
        members: { take: 6, include: { user: userMini }, orderBy: { createdAt: 'asc' } },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.project.count({ where }),
  ]);
  const stats = await projectStats(projects.map((p) => p.id));
  res.json({
    items: projects.map((p) => ({ ...p, stats: stats(p.id) })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

const projectBody = z.object({
  name: z.string().trim().min(2, 'Project name is required').max(100),
  key: keySchema.optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: statusEnum.optional(),
  color: colorSchema.optional(),
  ownerId: z.string().optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
  memberIds: z.array(z.string()).max(100).optional(),
});

projectsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const body = parse(projectBody, req.body);
  const user = me(req);
  if (body.ownerId && body.ownerId !== user.id && user.role !== 'ADMIN') throw forbidden('Only Admins can set another owner');
  const ownerId = body.ownerId ?? user.id;
  const key = body.key ?? (await generateKey(body.name));
  if (await prisma.project.findUnique({ where: { key } })) throw conflict(`Project key ${key} is already in use`);
  if (body.startDate && body.dueDate && body.dueDate < body.startDate) throw badRequest('Target date must be after start date');

  const memberIds = [...new Set([user.id, ownerId, ...(body.memberIds ?? [])])];
  const activeUsers = await prisma.user.findMany({ where: { id: { in: memberIds }, isActive: true }, select: { id: true } });
  if (activeUsers.length !== memberIds.length) throw badRequest('One or more selected members do not exist or are inactive');

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name: body.name,
        key,
        description: body.description ?? null,
        status: body.status ?? 'ACTIVE',
        color: body.color,
        ownerId,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        members: { create: memberIds.map((userId) => ({ userId, projectRole: userId === ownerId ? 'Owner' : null })) },
      },
    });
    await logActivity(tx, { actorId: user.id, eventType: 'PROJECT_CREATED', projectId: p.id, details: { name: p.name, key: p.key } });
    return p;
  });
  for (const uid of memberIds) syncUserProjectRoom(uid, project.id, true);
  joinAdminsToProject(project.id);
  await notifyUsers(memberIds, {
    actorId: user.id,
    type: 'PROJECT_MEMBER_ADDED',
    title: 'Added to a project',
    message: `${user.name} added you to ${project.name}`,
    projectId: project.id,
  });
  res.status(201).json({ project });
});

projectsRouter.get('/:projectId', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  await assertProjectAccess(user, projectId);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      owner: userMini,
      members: { include: { user: { select: { ...userMini.select, isActive: true, title: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  const stats = (await projectStats([projectId]))(projectId);
  const qa = await prisma.task.groupBy({
    by: ['qaStatus'],
    where: { projectId, archivedAt: null, qaRequired: true },
    _count: { _all: true },
  });
  res.json({
    project: {
      ...project,
      stats,
      qaStats: Object.fromEntries(qa.map((g) => [g.qaStatus, g._count._all])),
      canManage: await canManageProject(user, projectId),
    },
  });
});

projectsRouter.patch('/:projectId', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  const before = await assertCanManageProject(user, projectId);
  const body = parse(projectBody.partial().omit({ memberIds: true }), req.body);
  if (body.ownerId && user.role !== 'ADMIN') throw forbidden('Only Admins can transfer ownership');
  if (body.key && body.key !== before.key && (await prisma.project.findUnique({ where: { key: body.key } }))) {
    throw conflict(`Project key ${body.key} is already in use`);
  }
  const project = await prisma.$transaction(async (tx) => {
    if (body.ownerId) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: body.ownerId } },
        create: { projectId, userId: body.ownerId, projectRole: 'Owner' },
        update: {},
      });
    }
    const archiving = body.status === 'ARCHIVED' && before.status !== 'ARCHIVED';
    const unarchiving = body.status && body.status !== 'ARCHIVED' && before.status === 'ARCHIVED';
    const p = await tx.project.update({
      where: { id: projectId },
      data: { ...body, ...(archiving ? { archivedAt: new Date() } : {}), ...(unarchiving ? { archivedAt: null } : {}) },
    });
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(body) as (keyof typeof body)[]) {
      const from = before[k as keyof typeof before];
      const to = p[k as keyof typeof p];
      if (String(from) !== String(to)) changes[k] = { from, to };
    }
    if (Object.keys(changes).length) {
      await logActivity(tx, { actorId: user.id, eventType: 'PROJECT_UPDATED', projectId, details: changes as Prisma.InputJsonValue });
    }
    return p;
  });
  broadcastProject({ type: 'project.updated', projectId, actorId: user.id });
  res.json({ project });
});

/** Default: archive (soft). Admin may permanently delete an already-archived project with ?permanent=true&confirm=<name>. */
projectsRouter.delete('/:projectId', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  const project = await assertCanManageProject(user, projectId);
  const q = parse(z.object({ permanent: z.enum(['true', 'false']).default('false'), confirm: z.string().optional() }), req.query);

  if (q.permanent === 'true') {
    if (user.role !== 'ADMIN') throw forbidden('Only Admins can permanently delete projects');
    if (!project.archivedAt) throw badRequest('Archive the project before deleting it permanently');
    if (q.confirm !== project.name) throw badRequest('Type the exact project name to confirm permanent deletion');
    const files = await prisma.attachment.findMany({ where: { task: { projectId } }, select: { storageKey: true } });
    await prisma.$transaction(async (tx) => {
      await logActivity(tx, { actorId: user.id, eventType: 'PROJECT_ARCHIVED', details: { permanentlyDeleted: true, name: project.name, key: project.key } });
      await tx.project.delete({ where: { id: projectId } });
    });
    await Promise.all(files.map((f) => storage.remove(f.storageKey)));
    res.json({ ok: true, deleted: true });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    await logActivity(tx, { actorId: user.id, eventType: 'PROJECT_ARCHIVED', projectId });
  });
  broadcastProject({ type: 'project.archived', projectId, actorId: user.id });
  res.json({ ok: true, archived: true });
});

projectsRouter.post('/:projectId/restore', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  await assertCanManageProject(user, projectId);
  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { status: 'ACTIVE', archivedAt: null } });
    await logActivity(tx, { actorId: user.id, eventType: 'PROJECT_RESTORED', projectId });
  });
  broadcastProject({ type: 'project.updated', projectId, actorId: user.id });
  res.json({ ok: true });
});

projectsRouter.post('/:projectId/members', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  const project = await assertCanManageProject(user, projectId);
  const body = parse(z.object({ userId: z.string().min(1), projectRole: z.string().trim().max(40).nullable().optional() }), req.body);
  const target = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!target || !target.isActive) throw notFound('User not found or inactive');
  const existing = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: body.userId } } });
  if (existing) throw conflict(`${target.name} is already a member`);
  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.projectMember.create({
      data: { projectId, userId: body.userId, projectRole: body.projectRole ?? null },
      include: { user: { select: { ...userMini.select, isActive: true, title: true } } },
    });
    await logActivity(tx, {
      actorId: user.id,
      eventType: 'MEMBER_ADDED',
      projectId,
      details: { userId: target.id, name: target.name, role: target.role },
    });
    return m;
  });
  syncUserProjectRoom(target.id, projectId, true);
  broadcastProject({ type: 'project.members', projectId, actorId: user.id });
  await notifyUsers([target.id], {
    actorId: user.id,
    type: 'PROJECT_MEMBER_ADDED',
    title: 'Added to a project',
    message: `${user.name} added you to ${project.name}`,
    projectId,
  });
  res.status(201).json({ member });
});

projectsRouter.delete('/:projectId/members/:userId', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  const userId = param(req.params.userId);
  const project = await assertCanManageProject(user, projectId);
  if (project.ownerId === userId) throw badRequest('The project owner cannot be removed. Transfer ownership first.');
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { user: { select: { name: true } } },
  });
  if (!member) throw notFound('Member not found');
  await prisma.$transaction(async (tx) => {
    // Open work assigned to the removed member is unassigned so it does not become invisible.
    const unassigned = await tx.task.updateMany({
      where: { projectId, assigneeId: userId, status: { not: 'DONE' } },
      data: { assigneeId: null },
    });
    await tx.task.updateMany({ where: { projectId, qaAssigneeId: userId, status: { not: 'DONE' } }, data: { qaAssigneeId: null } });
    await tx.projectMember.delete({ where: { id: member.id } });
    await logActivity(tx, {
      actorId: user.id,
      eventType: 'MEMBER_REMOVED',
      projectId,
      details: { userId, name: member.user.name, unassignedTasks: unassigned.count },
    });
  });
  syncUserProjectRoom(userId, projectId, false);
  broadcastProject({ type: 'project.members', projectId, actorId: user.id });
  res.json({ ok: true });
});

projectsRouter.get('/:projectId/activity', async (req, res) => {
  const user = me(req);
  const projectId = param((req.params as Record<string, string>).projectId);
  await assertProjectAccess(user, projectId);
  const q = parse(pagination, req.query);
  const where = { projectId };
  const [items, total] = await Promise.all([
    prisma.activityEvent.findMany({
      where,
      include: { actor: userMini, task: { select: { id: true, title: true, number: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.activityEvent.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});
