import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { pagination, parse } from '../lib/validate';
import { me } from '../middleware/auth';
import { projectScope, taskScope } from '../services/access';
import { userMini } from '../services/serializers';

export const searchRouter = Router();
export const activityRouter = Router();

/** Global search across accessible projects and tasks (database-backed). */
searchRouter.get('/', async (req, res) => {
  const user = me(req);
  const { q } = parse(z.object({ q: z.string().trim().min(1).max(200) }), req.query);
  const keyMatch = q.match(/^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/);
  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: {
        ...projectScope(user),
        archivedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { key: { equals: q.toUpperCase() } },
        ],
      },
      select: { id: true, name: true, key: true, color: true, status: true },
      take: 6,
    }),
    prisma.task.findMany({
      where: {
        AND: [
          taskScope(user),
          { archivedAt: null, project: { archivedAt: null } },
          {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              ...(keyMatch ? [{ project: { key: keyMatch[1]!.toUpperCase() }, number: Number(keyMatch[2]) }] : []),
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        number: true,
        status: true,
        priority: true,
        qaStatus: true,
        projectId: true,
        project: { select: { key: true, name: true, color: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
  ]);
  res.json({ projects, tasks: tasks.map((t) => ({ ...t, key: `${t.project.key}-${t.number}` })) });
});

/** Audit/activity history. Admin: everything. Others: projects they belong to. */
activityRouter.get('/', async (req, res) => {
  const user = me(req);
  const q = parse(pagination.extend({ projectId: z.string().optional(), eventType: z.string().max(40).optional() }), req.query);
  const where: Prisma.ActivityEventWhereInput = {
    ...(user.role === 'ADMIN' ? {} : { project: projectScope(user) }),
    ...(q.projectId ? { projectId: q.projectId } : {}),
    ...(q.eventType ? { eventType: q.eventType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.activityEvent.findMany({
      where,
      include: {
        actor: userMini,
        task: { select: { id: true, title: true, number: true } },
        project: { select: { id: true, name: true, key: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.activityEvent.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});
