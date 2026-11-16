import { prisma } from '../lib/prisma';
import { emitToUser } from './realtime';

export interface NotificationInput {
  actorId?: string | null;
  type: string;
  title: string;
  message: string;
  projectId?: string | null;
  taskId?: string | null;
}

/**
 * Persist notifications for recipients (deduplicated, never the actor), then push them over Socket.IO.
 * Call AFTER the related transaction has committed.
 */
export async function notifyUsers(recipientIds: (string | null | undefined)[], n: NotificationInput) {
  const ids = [...new Set(recipientIds.filter((x): x is string => !!x && x !== n.actorId))];
  if (ids.length === 0) return;
  const active = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  for (const { id } of active) {
    const created = await prisma.notification.create({
      data: {
        recipientId: id,
        actorId: n.actorId ?? null,
        type: n.type,
        title: n.title,
        message: n.message,
        relatedProjectId: n.projectId ?? null,
        relatedTaskId: n.taskId ?? null,
      },
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });
    emitToUser(id, 'notification:new', created);
  }
}
