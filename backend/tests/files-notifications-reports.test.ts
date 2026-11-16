import { beforeEach, describe, expect, it } from 'vitest';
import { api, createTask, goodReport, resetDb, setupTeam } from './helpers';
import { prisma } from '../src/lib/prisma';
import { runDueDateCheck } from '../src/jobs/dueDates';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

describe('Attachments', () => {
  beforeEach(resetDb);

  it('uploads valid files, stores metadata, and only members can download', async () => {
    const { manager, dev, outsider, project } = await setupTeam();
    const t = await createTask(manager, project.id, { title: 'With files', assigneeId: dev.id });
    const up = await api(dev)
      .upload(`/api/tasks/${t.id}/attachments`)
      .attach('files', PNG, { filename: 'shot.png', contentType: 'image/png' })
      .attach('files', Buffer.from('line 1\nline 2\n'), { filename: '../../evil.log', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect(up.body.items).toHaveLength(2);
    const log = up.body.items.find((a: { originalName: string }) => a.originalName === 'evil.log');
    expect(log.storageKey).not.toContain('..');
    expect(log.storageKey).toMatch(/^\d{4}\/\d{2}\/[a-f0-9]{32}\.log$/);

    const dl = await api(manager).get(`/api/attachments/${log.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.text).toContain('line 2');
    expect(dl.headers['content-disposition']).toContain('attachment');

    expect((await api(outsider).get(`/api/attachments/${log.id}/download`)).status).toBe(403);
    expect((await api(outsider).upload(`/api/tasks/${t.id}/attachments`).attach('files', PNG, 'x.png')).status).toBe(403);
    expect(await prisma.activityEvent.count({ where: { eventType: 'ATTACHMENT_UPLOADED' } })).toBe(1);
  });

  it('rejects disallowed types, spoofed content and oversized files', async () => {
    const { manager, project } = await setupTeam();
    const t = await createTask(manager, project.id, { title: 'Files' });
    const exe = await api(manager).upload(`/api/tasks/${t.id}/attachments`).attach('files', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/octet-stream' });
    expect(exe.status).toBe(400);
    const fake = await api(manager).upload(`/api/tasks/${t.id}/attachments`).attach('files', Buffer.from('not a png'), { filename: 'fake.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    expect(fake.body.error.message).toMatch(/does not match/);
    const big = await api(manager)
      .upload(`/api/tasks/${t.id}/attachments`)
      .attach('files', Buffer.alloc(1.5 * 1024 * 1024, 'a'), { filename: 'big.txt', contentType: 'text/plain' });
    expect(big.status).toBe(400);
    expect(big.body.error.message).toMatch(/too large/);
    expect(await prisma.attachment.count()).toBe(0);
  });

  it('QA report evidence uploads via multipart and cannot be deleted', async () => {
    const { manager, dev, qa, project } = await setupTeam();
    const t = await createTask(manager, project.id, { title: 'Evidence', assigneeId: dev.id, qaRequired: true });
    await api(dev).post(`/api/tasks/${t.id}/submit-for-qa`);
    const r = await api(qa)
      .upload(`/api/tasks/${t.id}/qa-reports`)
      .field('data', JSON.stringify(goodReport('FAILED')))
      .attach('files', PNG, { filename: 'bug.png', contentType: 'image/png' });
    expect(r.status).toBe(201);
    expect(r.body.report.attachments).toHaveLength(1);
    const attId = r.body.report.attachments[0].id;
    expect((await api(manager).delete(`/api/attachments/${attId}`)).status).toBe(403);
  });
});

describe('Notifications', () => {
  beforeEach(resetDb);

  it('persist and are private to the recipient', async () => {
    const { manager, dev, qa, project } = await setupTeam();
    await createTask(manager, project.id, { title: 'Assign me', assigneeId: dev.id });
    const list = await api(dev).get('/api/notifications');
    // "Added to project" + "Task assigned"
    expect(list.body.unreadCount).toBe(2);
    const n = list.body.items.find((x: { type: string }) => x.type === 'TASK_ASSIGNED');
    expect(n).toBeTruthy();
    expect((await api(qa).patch(`/api/notifications/${n.id}/read`)).status).toBe(404);
    expect((await api(dev).patch(`/api/notifications/${n.id}/read`)).body.notification.readAt).toBeTruthy();
    expect((await api(dev).get('/api/notifications')).body.unreadCount).toBe(1);
    expect((await api(dev).patch('/api/notifications/read-all')).body.updated).toBe(1);
    expect((await api(dev).get('/api/notifications')).body.unreadCount).toBe(0);
    // The actor is never notified about their own action
    expect((await api(manager).get('/api/notifications')).body.items.filter((x: { type: string }) => x.type === 'TASK_ASSIGNED')).toHaveLength(0);
  });

  it('due date job notifies once for due-soon and overdue tasks', async () => {
    const { manager, dev, project } = await setupTeam();
    await createTask(manager, project.id, { title: 'Soon', assigneeId: dev.id, dueDate: new Date(Date.now() + 3600_000).toISOString() });
    await createTask(manager, project.id, { title: 'Late', assigneeId: dev.id, dueDate: '2001-01-01' });
    const r1 = await runDueDateCheck();
    expect(r1).toEqual({ dueSoon: 1, overdue: 1 });
    expect(await runDueDateCheck()).toEqual({ dueSoon: 0, overdue: 0 });
    expect(await prisma.notification.count({ where: { recipientId: dev.id, type: { in: ['TASK_DUE_SOON', 'TASK_OVERDUE'] } } })).toBe(2);
  });
});

describe('Dashboard & reports', () => {
  beforeEach(resetDb);

  it('computes counts from real data and respects access scope', async () => {
    const { manager, dev, qa, outsider, admin, project } = await setupTeam();
    const a = await createTask(manager, project.id, { title: 'A', assigneeId: dev.id });
    await createTask(manager, project.id, { title: 'B', assigneeId: dev.id, dueDate: '2001-01-01' });
    const c = await createTask(manager, project.id, { title: 'C', assigneeId: dev.id, qaRequired: true });
    await api(dev).patch(`/api/tasks/${a.id}/status`, { status: 'DONE' });
    await api(dev).post(`/api/tasks/${c.id}/submit-for-qa`);
    await api(qa).post(`/api/tasks/${c.id}/qa-reports`, goodReport('FAILED'));

    const d = await api(manager).get('/api/dashboard');
    expect(d.body.summary).toMatchObject({ projects: 1, total: 3, todo: 1, inProgress: 1, done: 1, overdue: 1 });
    expect(d.body.manager.qaFailures).toHaveLength(1);

    const devDash = await api(dev).get('/api/dashboard');
    expect(devDash.body.developer.mine).toMatchObject({ todo: 1, inProgress: 1, done: 1, reopened: 1 });
    expect(devDash.body.developer.returnedByQa).toHaveLength(1);

    const adminDash = await api(admin).get('/api/dashboard');
    expect(adminDash.body.admin.usersByRole).toMatchObject({ ADMIN: 1, MANAGER: 1, QA: 1, DEVELOPER: 2 });
    expect(adminDash.body.admin.qa).toEqual({ passed: 0, failed: 1 });

    const outsiderDash = await api(outsider).get('/api/dashboard');
    expect(outsiderDash.body.summary.total).toBe(0);

    const summary = await api(manager).get('/api/reports/summary');
    expect(summary.body.inRange).toMatchObject({ completed: 1, qaFailed: 1, qaPassed: 0, reopened: 1 });
    const tasks = await api(manager).get(`/api/reports/tasks?projectId=${project.id}`);
    expect(tasks.body.byStatus).toEqual([
      { status: 'TODO', count: 1 },
      { status: 'IN_PROGRESS', count: 1 },
      { status: 'DONE', count: 1 },
    ]);
    expect(tasks.body.overdue).toHaveLength(1);
    expect(tasks.body.completedOverTime.reduce((s: number, x: { count: number }) => s + x.count, 0)).toBe(1);
    const qaRep = await api(manager).get('/api/reports/qa');
    expect(qaRep.body).toMatchObject({ passed: 0, failed: 1 });
    expect(qaRep.body.reopenedTasks).toHaveLength(1);
    expect((await api(outsider).get(`/api/reports/tasks?projectId=${project.id}`)).status).toBe(403);
    const act = await api(manager).get('/api/reports/activity');
    expect(act.body.people.length).toBeGreaterThan(0);
  });
});
