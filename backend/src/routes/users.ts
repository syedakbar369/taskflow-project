import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emailSchema, pagination, param, parse, passwordSchema } from '../lib/validate';
import { badRequest, conflict, notFound } from '../lib/errors';
import { me, requireRole } from '../middleware/auth';
import { userPublic } from '../services/serializers';
import { logActivity } from '../services/activity';

export const usersRouter = Router();

const roleEnum = z.enum(['ADMIN', 'MANAGER', 'QA', 'DEVELOPER']);

function tempPassword() {
  return `Tf-${crypto.randomBytes(6).toString('base64url')}9`;
}

// Admin: full user directory. Manager: read-only list (needed to add project members).
usersRouter.get('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const q = parse(
    pagination.extend({
      q: z.string().trim().max(100).optional(),
      role: roleEnum.optional(),
      status: z.enum(['active', 'inactive', 'all']).default('all'),
    }),
    req.query,
  );
  const user = me(req);
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.q
      ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] }
      : {}),
  };
  if (user.role !== 'ADMIN' || q.status === 'active') where.isActive = true;
  else if (q.status === 'inactive') where.isActive = false;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        ...userPublic,
        _count: { select: { memberships: true, assignedTasks: { where: { status: { not: 'DONE' }, archivedAt: null } } } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

usersRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(80),
      email: emailSchema,
      role: roleEnum,
      title: z.string().trim().max(80).optional(),
      password: passwordSchema.optional(),
    }),
    req.body,
  );
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('An account with this email already exists');
  const generated = body.password ? undefined : tempPassword();
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      role: body.role,
      title: body.title,
      passwordHash: await bcrypt.hash(body.password ?? generated!, 12),
    },
    select: userPublic,
  });
  await logActivity(prisma, { actorId: me(req).id, eventType: 'USER_CREATED', details: { userId: user.id, role: user.role, email: user.email } });
  // A generated temporary password is returned exactly once so the Admin can share it.
  res.status(201).json({ user, temporaryPassword: generated });
});

usersRouter.get('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: param(req.params.id) },
    select: {
      ...userPublic,
      memberships: { select: { project: { select: { id: true, name: true, key: true, color: true } } } },
    },
  });
  if (!user) throw notFound('User not found');
  res.json({ user });
});

usersRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      email: emailSchema.optional(),
      title: z.string().trim().max(80).nullable().optional(),
    }),
    req.body,
  );
  const id = param(req.params.id);
  if (body.email) {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing && existing.id !== id) throw conflict('An account with this email already exists');
  }
  const user = await prisma.user.update({ where: { id }, data: body, select: userPublic });
  await logActivity(prisma, { actorId: me(req).id, eventType: 'USER_UPDATED', details: { userId: id, changes: body } });
  res.json({ user });
});

usersRouter.patch('/:id/status', requireRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ isActive: z.boolean() }), req.body);
  const id = param(req.params.id);
  if (id === me(req).id && !body.isActive) throw badRequest('You cannot deactivate your own account');
  const user = await prisma.user.update({
    where: { id },
    // Deactivation revokes all existing sessions immediately.
    data: { isActive: body.isActive, ...(body.isActive ? {} : { tokenVersion: { increment: 1 } }) },
    select: userPublic,
  });
  await logActivity(prisma, { actorId: me(req).id, eventType: 'USER_STATUS_CHANGED', details: { userId: id, isActive: body.isActive } });
  res.json({ user });
});

usersRouter.patch('/:id/role', requireRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ role: roleEnum }), req.body);
  const id = param(req.params.id);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound('User not found');
  if (target.role === 'ADMIN' && body.role !== 'ADMIN') {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (admins <= 1) throw badRequest('There must be at least one active Admin');
  }
  const user = await prisma.user.update({ where: { id }, data: { role: body.role }, select: userPublic });
  await logActivity(prisma, { actorId: me(req).id, eventType: 'USER_ROLE_CHANGED', details: { userId: id, from: target.role, to: body.role } });
  res.json({ user });
});

usersRouter.post('/:id/reset-password', requireRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ password: passwordSchema.optional() }), req.body ?? {});
  const generated = body.password ? undefined : tempPassword();
  await prisma.user.update({
    where: { id: param(req.params.id) },
    data: { passwordHash: await bcrypt.hash(body.password ?? generated!, 12), tokenVersion: { increment: 1 } },
  });
  res.json({ ok: true, temporaryPassword: generated });
});
