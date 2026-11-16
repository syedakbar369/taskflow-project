import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { app, api, createTask, goodReport, makeUser, PASSWORD, resetDb, setupTeam } from './helpers';
import { createSocketServer } from '../src/socket';
import { setIo } from '../src/services/realtime';

let server: http.Server;
let url: string;

beforeAll(async () => {
  server = http.createServer(app);
  createSocketServer(server);
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  setIo(null);
  await new Promise((r) => server.close(r));
});

function connect(token: string) {
  return new Promise<Socket>((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('ready', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const next = <T>(s: Socket, event: string, ms = 3000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (p: T) => {
      clearTimeout(timer);
      resolve(p);
    });
  });

describe('Socket.IO real-time', () => {
  beforeEach(resetDb);

  it('rejects unauthenticated connections', async () => {
    await expect(connect('bad-token')).rejects.toThrow(/unauthorized/);
  });

  it('broadcasts task moves to project members only, and pushes notifications', async () => {
    const { manager, dev, outsider, project } = await setupTeam();
    const t = await createTask(manager, project.id, { title: 'Live', assigneeId: dev.id });
    const managerSock = await connect(manager.token);
    const outsiderSock = await connect(outsider.token);
    let outsiderGot = false;
    outsiderSock.on('project:changed', () => (outsiderGot = true));

    const changed = next<{ type: string; taskId: string }>(managerSock, 'project:changed');
    const notif = next<{ type: string }>(managerSock, 'notification:new');
    await api(dev).patch(`/api/tasks/${t.id}/status`, { status: 'IN_PROGRESS' });
    expect(await changed).toMatchObject({ type: 'task.moved', taskId: t.id, projectId: project.id });
    expect((await notif).type).toBe('TASK_STATUS_CHANGED');
    await new Promise((r) => setTimeout(r, 200));
    expect(outsiderGot).toBe(false);

    // Outsider cannot join the room by asking
    const ok = await new Promise((r) => outsiderSock.emit('project:join', project.id, r));
    expect(ok).toBe(false);
    managerSock.close();
    outsiderSock.close();
  });
});

describe('End-to-end acceptance scenario (API level)', () => {
  beforeEach(resetDb);

  it('runs the full Admin → Manager → Developer → QA lifecycle', async () => {
    // 1. Admin signs up (first user) and creates a project
    const signup = await request(app).post('/api/auth/signup').send({ name: 'Root Admin', email: 'root@x.com', password: PASSWORD });
    const admin = { ...signup.body.user, token: signup.body.token };
    expect(admin.role).toBe('ADMIN');
    const manager = await makeUser('MANAGER', 'Mia Manager');
    const qa = await makeUser('QA', 'Quentin QA');
    const dev = await makeUser('DEVELOPER', 'Devon Dev');
    const stranger = await makeUser('DEVELOPER', 'Stan Stranger');
    const proj = await api(admin).post('/api/projects', { name: 'Acceptance', description: 'E2E' });
    expect(proj.status).toBe(201);
    const pid = proj.body.project.id;

    // 2. Admin adds Manager, QA and Developer
    for (const u of [manager, qa, dev]) expect((await api(admin).post(`/api/projects/${pid}/members`, { userId: u.id })).status).toBe(201);

    // 3. Manager creates a QA-required task assigned to the Developer
    const t = await createTask(manager, pid, { title: 'Login page', assigneeId: dev.id, qaRequired: true, qaAssigneeId: qa.id });

    // 4. Developer moves it to In Progress
    expect((await api(dev).patch(`/api/tasks/${t.id}/status`, { status: 'IN_PROGRESS' })).body.task.status).toBe('IN_PROGRESS');

    // 5. Developer adds fix note + attachment and submits for QA
    await api(dev).post(`/api/tasks/${t.id}/comments`, { content: 'Implemented the form' });
    expect((await api(dev).upload(`/api/tasks/${t.id}/attachments`).attach('files', Buffer.from('ok'), { filename: 'notes.txt', contentType: 'text/plain' })).status).toBe(201);
    expect((await api(dev).post(`/api/tasks/${t.id}/submit-for-qa`, { note: 'Ready' })).body.task.qaStatus).toBe('AWAITING_QA');

    // 6. QA sees it in the queue
    expect((await api(qa).get('/api/qa/queue?scope=mine')).body.items.map((x: { id: string }) => x.id)).toContain(t.id);

    // 7. QA fails it -> reopened for Developer with notification
    await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('FAILED'));
    const afterFail = (await api(dev).get(`/api/tasks/${t.id}`)).body;
    expect(afterFail.task).toMatchObject({ qaStatus: 'FAILED', status: 'IN_PROGRESS', reopenCount: 1 });
    expect(afterFail.permissions.canResubmitForQa).toBe(true);
    expect((await api(dev).get('/api/notifications')).body.items.some((n: { type: string }) => n.type === 'QA_FAILED')).toBe(true);

    // 8. Developer fixes and resubmits
    await api(dev).post(`/api/tasks/${t.id}/resubmit-for-qa`, { note: 'Fixed validation' });

    // 9-10. QA passes it -> Done
    await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('PASSED'));
    expect((await api(manager).get(`/api/tasks/${t.id}`)).body.task.status).toBe('DONE');

    // 11. Manager sees updated metrics and activity
    const dash = (await api(manager).get('/api/dashboard')).body;
    expect(dash.summary.done).toBe(1);
    expect(dash.recentActivity.length).toBeGreaterThan(5);

    // 12. Admin sees users, projects, tasks, QA metrics and reports
    expect((await api(admin).get('/api/users')).body.total).toBe(5);
    const qaRep = (await api(admin).get('/api/reports/qa')).body;
    expect(qaRep).toMatchObject({ passed: 1, failed: 1 });

    // 13. A user without access cannot read tasks or files
    expect((await api(stranger).get(`/api/projects/${pid}/tasks`)).status).toBe(403);
    expect((await api(stranger).get(`/api/tasks/${t.id}`)).status).toBe(403);
    const att = (await api(admin).get(`/api/tasks/${t.id}/attachments`)).body.items[0];
    expect((await api(stranger).get(`/api/attachments/${att.id}/download`)).status).toBe(403);
  });
});
