import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { pagination, param, parse } from '../lib/validate';
import { notFound } from '../lib/errors';
import { me } from '../middleware/auth';

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const user = me(req);
  const q = parse(pagination.extend({ unreadOnly: z.enum(['true', 'false']).default('false') }), req.query);
  const where = { recipientId: user.id, ...(q.unreadOnly === 'true' ? { readAt: null } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
  ]);
  res.json({ items, total, unreadCount, page: q.page, pageSize: q.pageSize });
});

notificationsRouter.patch('/read-all', async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { recipientId: me(req).id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true, updated: r.count });
});

notificationsRouter.patch('/:id/read', async (req, res) => {
  const user = me(req);
  const n = await prisma.notification.findUnique({ where: { id: param(req.params.id) } });
  // Never reveal other users' notifications.
  if (!n || n.recipientId !== user.id) throw notFound('Notification not found');
  const updated = await prisma.notification.update({ where: { id: n.id }, data: { readAt: n.readAt ?? new Date() } });
  res.json({ notification: updated });
});
