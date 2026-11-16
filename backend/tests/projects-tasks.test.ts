import { beforeEach, describe, expect, it } from 'vitest';
import { api, createTask, makeUser, resetDb, setupTeam } from './helpers';
import { prisma } from '../src/lib/prisma';

describe('Projects & membership', () => {
  beforeEach(resetDb);

  it('Manager creates a project and is owner + member; Developer cannot create projects', async () => {
    const { manager, dev, project } = await setupTeam();
    const p = await api(manager).get(`/api/projects/${project.id}`);
    expect(p.status).toBe(200);
    expect(p.body.project.members).toHaveLength(3);
    expect(p.body.project.canManage).toBe(true);
    expect((await api(dev).post('/api/projects', { name: 'Nope' })).status).toBe(403);
  });

  it('non-members cannot see the project, its tasks or activity', async () => {
    const { manager, outsider, project } = await setupTeam();
    await createTask(manager, project.id, { title: 'Secret' });
    expect((await api(outsider).get(`/api/projects/${project.id}`)).status).toBe(403);
    expect((await api(outsider).get(`/api/projects/${project.id}/tasks`)).status).toBe(403);
    expect((await api(outsider).get(`/api/projects/${project.id}/activity`)).status).toBe(403);
    const list = await api(outsider).get('/api/projects');
    expect(list.body.items).toHaveLength(0);
    const search = await api(outsider).get('/api/tasks?q=Secret');
    expect(search.body.items).toHaveLength(0);
  });

  it('adds and removes members, unassigning open work', async () => {
    const { manager, outsider, project } = await setupTeam();
    const add = await api(manager).post(`/api/projects/${project.id}/members`, { userId: outsider.id });
    expect(add.status).toBe(201);
    const t = await createTask(manager, project.id, { title: 'For outsider', assigneeId: outsider.id });
    expect((await api(outsider).get(`/api/tasks/${t.id}`)).status).toBe(200);
    const rm = await api(manager).delete(`/api/projects/${project.id}/members/${outsider.id}`);
    expect(rm.status).toBe(200);
    expect((await api(outsider).get(`/api/tasks/${t.id}`)).status).toBe(403);
    const task = await prisma.task.findUnique({ where: { id: t.id } });
    expect(task?.assigneeId).toBeNull();
  });

  it('archives a project (soft) and only Admin can permanently delete', async () => {
    const { admin, manager, project } = await setupTeam();
    expect((await api(manager).delete(`/api/projects/${project.id}`)).body.archived).toBe(true);
    expect((await api(manager).delete(`/api/projects/${project.id}?permanent=true&confirm=Demo%20Project`)).status).toBe(403);
    expect((await api(admin).delete(`/api/projects/${project.id}?permanent=true&confirm=wrong`)).status).toBe(400);
    const del = await api(admin).delete(`/api/projects/${project.id}?permanent=true&confirm=Demo%20Project`);
    expect(del.body.deleted).toBe(true);
    // Audit record survives
    expect(await prisma.activityEvent.count({ where: { eventType: 'PROJECT_ARCHIVED' } })).toBeGreaterThan(0);
  });
});

describe('Tasks', () => {
  beforeEach(resetDb);

  it('CRUD: create, read, update, archive with activity history', async () => {
    const { manager, dev, project } = await setupTeam();
    const label = await api(manager).post('/api/labels', { name: 'Bug', color: '#DC2626' });
    const t = await createTask(manager, project.id, { title: 'Fix login', priority: 'HIGH', assigneeId: dev.id, labelIds: [label.body.label.id] });
    expect(t.key).toBe('DEMO-1');
    const got = await api(dev).get(`/api/tasks/${t.id}`);
    expect(got.body.task.labels[0].name).toBe('Bug');
    expect(got.body.permissions.canEdit).toBe(false);
    expect(got.body.permissions.canMove).toBe(true);

    const upd = await api(manager).patch(`/api/tasks/${t.id}`, { priority: 'URGENT', dueDate: '2030-01-01', title: 'Fix login now' });
    expect(upd.status).toBe(200);
    expect(upd.body.task.priority).toBe('URGENT');
    expect((await api(dev).patch(`/api/tasks/${t.id}`, { title: 'hack' })).status).toBe(403);

    const events = (await api(manager).get(`/api/tasks/${t.id}/activity`)).body.items.map((e: { eventType: string }) => e.eventType);
    expect(events).toEqual(expect.arrayContaining(['TASK_CREATED', 'PRIORITY_CHANGED', 'DUE_DATE_CHANGED', 'TASK_UPDATED']));

    expect((await api(manager).post(`/api/tasks/${t.id}/archive`)).status).toBe(200);
    const list = await api(manager).get(`/api/projects/${project.id}/tasks`);
    expect(list.body.items).toHaveLength(0);
  });

  it('rejects assigning tasks to non-members', async () => {
    const { manager, outsider, project } = await setupTeam();
    const res = await api(manager).post(`/api/projects/${project.id}/tasks`, { title: 'X', assigneeId: outsider.id });
    expect(res.status).toBe(403);
    const t = await createTask(manager, project.id, { title: 'Y' });
    expect((await api(manager).patch(`/api/tasks/${t.id}/assignee`, { assigneeId: outsider.id })).status).toBe(403);
  });

  it('valid and invalid status transitions', async () => {
    const { manager, dev, qa, project } = await setupTeam();
    const other = await makeUser('DEVELOPER', 'Other Dev');
    await api(manager).post(`/api/projects/${project.id}/members`, { userId: other.id });
    const t = await createTask(manager, project.id, { title: 'Simple', assigneeId: dev.id });

    expect((await api(dev).patch(`/api/tasks/${t.id}/status`, { status: 'IN_PROGRESS' })).status).toBe(200);
    // Non-assignee developer cannot move
    expect((await api(other).patch(`/api/tasks/${t.id}/status`, { status: 'DONE' })).status).toBe(403);
    // QA cannot drag
    expect((await api(qa).patch(`/api/tasks/${t.id}/status`, { status: 'DONE' })).status).toBe(403);
    // Invalid status value
    expect((await api(dev).patch(`/api/tasks/${t.id}/status`, { status: 'BLOCKED' })).status).toBe(400);
    const done = await api(dev).patch(`/api/tasks/${t.id}/status`, { status: 'DONE' });
    expect(done.body.task.status).toBe('DONE');
    expect(done.body.task.completedAt).toBeTruthy();
    // Persisted
    expect((await prisma.task.findUnique({ where: { id: t.id } }))?.status).toBe('DONE');
  });

  it('Developer cannot move a QA-required task directly to Done', async () => {
    const { manager, dev, project } = await setupTeam();
    const t = await createTask(manager, project.id, { title: 'Needs QA', assigneeId: dev.id, qaRequired: true });
    expect(t.qaStatus).toBe('PENDING');
    const res = await api(dev).patch(`/api/tasks/${t.id}/status`, { status: 'DONE' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/QA approval/);
    // Manager also blocked: Done requires a Passed QA result
    expect((await api(manager).patch(`/api/tasks/${t.id}/status`, { status: 'DONE' })).status).toBe(422);
  });

  it('search and filters are database-backed', async () => {
    const { manager, dev, project } = await setupTeam();
    await createTask(manager, project.id, { title: 'Payment bug', priority: 'URGENT', assigneeId: dev.id });
    await createTask(manager, project.id, { title: 'Docs update', priority: 'LOW', dueDate: '2000-01-01' });
    const s = await api(dev).get('/api/tasks?q=payment');
    expect(s.body.items).toHaveLength(1);
    expect((await api(dev).get('/api/tasks?priority=URGENT,HIGH')).body.items).toHaveLength(1);
    expect((await api(dev).get('/api/tasks?assigneeId=me')).body.items).toHaveLength(1);
    expect((await api(dev).get('/api/tasks?overdue=true')).body.items[0].title).toBe('Docs update');
    expect((await api(dev).get('/api/tasks?q=DEMO-2')).body.items[0].title).toBe('Docs update');
    const g = await api(dev).get('/api/search?q=docs');
    expect(g.body.tasks).toHaveLength(1);
  });

  it('comments: author edits, others cannot; delete is soft with audit trail', async () => {
    const { manager, dev, project } = await setupTeam();
    const t = await createTask(manager, project.id, { title: 'Discuss', assigneeId: dev.id });
    const c = await api(manager).post(`/api/tasks/${t.id}/comments`, { content: 'Hi @Dana please check' });
    expect(c.status).toBe(201);
    expect(await prisma.notification.count({ where: { recipientId: dev.id, type: 'COMMENT_MENTION' } })).toBe(1);
    expect((await api(dev).patch(`/api/comments/${c.body.comment.id}`, { content: 'hacked' })).status).toBe(403);
    expect((await api(manager).patch(`/api/comments/${c.body.comment.id}`, { content: 'edited' })).status).toBe(200);
    expect((await api(manager).delete(`/api/comments/${c.body.comment.id}`)).status).toBe(200);
    const list = await api(dev).get(`/api/tasks/${t.id}/comments`);
    expect(list.body.items[0].deletedAt).toBeTruthy();
    expect(list.body.items[0].content).toBe('');
    const audit = await prisma.activityEvent.findFirst({ where: { eventType: 'COMMENT_DELETED' } });
    expect((audit?.details as { previous: string }).previous).toBe('edited');
  });
});
