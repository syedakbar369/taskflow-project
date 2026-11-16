import { prisma } from '../lib/prisma';
import { notifyUsers } from '../services/notify';
import { projectManagerIds } from '../services/access';

const DAY = 24 * 60 * 60 * 1000;

/** Notify assignees about tasks due within 24h and about overdue tasks (once per due date). */
export async function runDueDateCheck(now = new Date()) {
  const dueSoon = await prisma.task.findMany({
    where: {
      archivedAt: null,
      status: { not: 'DONE' },
      assigneeId: { not: null },
      dueSoonNotifiedAt: null,
      dueDate: { gte: now, lte: new Date(now.getTime() + DAY) },
    },
    include: { project: { select: { key: true } } },
    take: 200,
  });
  for (const t of dueSoon) {
    await notifyUsers([t.assigneeId], {
      type: 'TASK_DUE_SOON',
      title: 'Due soon',
      message: `${t.project.key}-${t.number}: ${t.title} is due within 24 hours`,
      projectId: t.projectId,
      taskId: t.id,
    });
    await prisma.task.update({ where: { id: t.id }, data: { dueSoonNotifiedAt: now } });
  }

  const overdue = await prisma.task.findMany({
    where: { archivedAt: null, status: { not: 'DONE' }, overdueNotifiedAt: null, dueDate: { lt: now } },
    include: { project: { select: { key: true } } },
    take: 200,
  });
  for (const t of overdue) {
    await notifyUsers([t.assigneeId, ...(await projectManagerIds(t.projectId))], {
      type: 'TASK_OVERDUE',
      title: 'Task overdue',
      message: `${t.project.key}-${t.number}: ${t.title} is past its due date`,
      projectId: t.projectId,
      taskId: t.id,
    });
    await prisma.task.update({ where: { id: t.id }, data: { overdueNotifiedAt: now } });
  }
  return { dueSoon: dueSoon.length, overdue: overdue.length };
}

export function startDueDateJob(intervalMs = 15 * 60 * 1000) {
  const tick = () => runDueDateCheck().catch((e) => console.error('[due-date job]', e));
  setTimeout(tick, 10_000);
  return setInterval(tick, intervalMs);
}
