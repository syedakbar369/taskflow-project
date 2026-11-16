import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { param, parse } from '../lib/validate';
import { forbidden, notFound } from '../lib/errors';
import { me } from '../middleware/auth';
import { assertTaskAccess } from '../services/access';
import { logActivity } from '../services/activity';
import { notifyUsers } from '../services/notify';
import { broadcastProject } from '../services/realtime';
import { userMini } from '../services/serializers';

export const taskCommentsRouter = Router({ mergeParams: true });
export const commentsRouter = Router();

const contentSchema = z.object({ content: z.string().trim().min(1, 'Comment cannot be empty').max(10000) });

function present<T extends { deletedAt: Date | null; content: string }>(c: T) {
  return c.deletedAt ? { ...c, content: '' } : c;
}

taskCommentsRouter.get('/', async (req, res) => {
  const task = await assertTaskAccess(me(req), param((req.params as Record<string, string>).taskId));
  const items = await prisma.comment.findMany({
    where: { taskId: task.id },
    include: { author: userMini },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  res.json({ items: items.map(present) });
});

taskCommentsRouter.post('/', async (req, res) => {
  const user = me(req);
  const task = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  const body = parse(contentSchema, req.body);
  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({
      data: { taskId: task.id, authorId: user.id, content: body.content },
      include: { author: userMini },
    });
    await logActivity(tx, {
      actorId: user.id,
      projectId: task.projectId,
      taskId: task.id,
      eventType: 'COMMENT_ADDED',
      details: { commentId: c.id, excerpt: body.content.slice(0, 140) },
    });
    return c;
  });

  // @mentions: match "@firstname" or "@fullname" (spaces removed) of project members.
  const members = await prisma.projectMember.findMany({
    where: { projectId: task.projectId },
    select: { user: { select: { id: true, name: true } } },
  });
  const lower = body.content.toLowerCase();
  const mentioned = members
    .filter(({ user: u }) => {
      const first = u.name.split(/\s+/)[0]!.toLowerCase();
      const full = u.name.replace(/\s+/g, '').toLowerCase();
      return new RegExp(`@(${first}|${full})\\b`).test(lower);
    })
    .map((m) => m.user.id);
  const key = `${task.project.key}-${task.number}`;
  await notifyUsers(mentioned, {
    actorId: user.id,
    type: 'COMMENT_MENTION',
    title: 'You were mentioned',
    message: `${user.name} mentioned you on ${key}: ${body.content.slice(0, 120)}`,
    projectId: task.projectId,
    taskId: task.id,
  });
  await notifyUsers(
    [task.assigneeId, task.reporterId, task.qaAssigneeId].filter((id) => id && !mentioned.includes(id)),
    {
      actorId: user.id,
      type: 'COMMENT_ADDED',
      title: 'New comment',
      message: `${user.name} commented on ${key}: ${body.content.slice(0, 120)}`,
      projectId: task.projectId,
      taskId: task.id,
    },
  );
  broadcastProject({ type: 'comment.created', projectId: task.projectId, taskId: task.id, actorId: user.id });
  res.status(201).json({ comment });
});

/** Authors may edit their own comments; previous content is kept in the activity log. */
commentsRouter.patch('/:commentId', async (req, res) => {
  const user = me(req);
  const existing = await prisma.comment.findUnique({ where: { id: param(req.params.commentId) } });
  if (!existing || existing.deletedAt) throw notFound('Comment not found');
  const task = await assertTaskAccess(user, existing.taskId);
  if (existing.authorId !== user.id) throw forbidden('You can only edit your own comments');
  const body = parse(contentSchema, req.body);
  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.update({
      where: { id: existing.id },
      data: { content: body.content, editedAt: new Date() },
      include: { author: userMini },
    });
    await logActivity(tx, {
      actorId: user.id,
      projectId: task.projectId,
      taskId: task.id,
      eventType: 'COMMENT_EDITED',
      details: { commentId: c.id, previous: existing.content },
    });
    return c;
  });
  broadcastProject({ type: 'comment.updated', projectId: task.projectId, taskId: task.id, actorId: user.id });
  res.json({ comment });
});

/** Soft delete: author or Admin. Original content is preserved in the activity log for audit. */
commentsRouter.delete('/:commentId', async (req, res) => {
  const user = me(req);
  const existing = await prisma.comment.findUnique({ where: { id: param(req.params.commentId) } });
  if (!existing || existing.deletedAt) throw notFound('Comment not found');
  const task = await assertTaskAccess(user, existing.taskId);
  if (existing.authorId !== user.id && user.role !== 'ADMIN') throw forbidden('You can only delete your own comments');
  await prisma.$transaction(async (tx) => {
    await tx.comment.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await logActivity(tx, {
      actorId: user.id,
      projectId: task.projectId,
      taskId: task.id,
      eventType: 'COMMENT_DELETED',
      details: { commentId: existing.id, previous: existing.content },
    });
  });
  broadcastProject({ type: 'comment.deleted', projectId: task.projectId, taskId: task.id, actorId: user.id });
  res.json({ ok: true });
});
