import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { param, parse } from '../lib/validate';
import { requireRole } from '../middleware/auth';

export const labelsRouter = Router();

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #F06A4A');

labelsRouter.get('/', async (_req, res) => {
  const items = await prisma.label.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { tasks: true } } } });
  res.json({ items });
});

labelsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(30), color: color.default('#64748B') }), req.body);
  const label = await prisma.label.create({ data: body });
  res.status(201).json({ label });
});

labelsRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(30).optional(), color: color.optional() }), req.body);
  const label = await prisma.label.update({ where: { id: param(req.params.id) }, data: body });
  res.json({ label });
});

labelsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  await prisma.label.delete({ where: { id: param(req.params.id) } });
  res.json({ ok: true });
});
