import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parse } from '../lib/validate';
import { me } from '../middleware/auth';
import { userPublic } from '../services/serializers';

/** Team directory: Admin sees everyone; others see people they share at least one project with. */
export const teamRouter = Router();

teamRouter.get('/', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(100).optional(), projectId: z.string().optional() }), req.query);
  const user = me(req);
  const sharedProjects =
    user.role === 'ADMIN'
      ? undefined
      : (await prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } })).map((m) => m.projectId);

  const projectFilter = q.projectId
    ? sharedProjects && !sharedProjects.includes(q.projectId)
      ? ['__none__']
      : [q.projectId]
    : sharedProjects;

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(projectFilter ? { memberships: { some: { projectId: { in: projectFilter } } } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
    },
    select: {
      ...userPublic,
      memberships: {
        where: projectFilter ? { projectId: { in: projectFilter } } : undefined,
        select: { project: { select: { id: true, name: true, key: true, color: true } } },
      },
    },
    orderBy: { name: 'asc' },
    take: 200,
  });

  // Objective workload counts (open tasks by status) — not a productivity score.
  const workload = await prisma.task.groupBy({
    by: ['assigneeId', 'status'],
    where: {
      assigneeId: { in: users.map((u) => u.id) },
      archivedAt: null,
      status: { not: 'DONE' },
      ...(projectFilter ? { projectId: { in: projectFilter } } : {}),
    },
    _count: { _all: true },
  });
  const items = users.map((u) => ({
    ...u,
    projects: u.memberships.map((m) => m.project),
    memberships: undefined,
    openTasks: {
      TODO: workload.find((w) => w.assigneeId === u.id && w.status === 'TODO')?._count._all ?? 0,
      IN_PROGRESS: workload.find((w) => w.assigneeId === u.id && w.status === 'IN_PROGRESS')?._count._all ?? 0,
    },
  }));
  res.json({ items });
});
