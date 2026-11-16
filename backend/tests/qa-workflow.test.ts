import { beforeEach, describe, expect, it } from 'vitest';
import { api, createTask, goodReport, makeUser, resetDb, setupTeam } from './helpers';
import { prisma } from '../src/lib/prisma';

describe('QA → Developer workflow', () => {
  beforeEach(resetDb);

  async function submitted() {
    const team = await setupTeam();
    const t = await createTask(team.manager, team.project.id, { title: 'Feature X', assigneeId: team.dev.id, qaRequired: true });
    const sub = await api(team.dev).post(`/api/tasks/${t.id}/submit-for-qa`, { note: 'Implemented X' });
    expect(sub.status).toBe(200);
    expect(sub.body.task.qaStatus).toBe('AWAITING_QA');
    expect(sub.body.task.status).toBe('IN_PROGRESS');
    return { ...team, t };
  }

  it('submit for QA notifies QA and managers and records submitter', async () => {
    const { qa, manager, dev, t } = await submitted();
    const task = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(task.submittedById).toBe(dev.id);
    expect(await prisma.notification.count({ where: { recipientId: qa.id, type: 'TASK_SUBMITTED_FOR_QA' } })).toBe(1);
    expect(await prisma.notification.count({ where: { recipientId: manager.id, type: 'TASK_SUBMITTED_FOR_QA' } })).toBe(1);
    expect(await prisma.comment.count({ where: { taskId: t.id, kind: 'FIX_NOTE' } })).toBe(1);
    // Cannot submit twice
    expect((await api(dev).post(`/api/tasks/${t.id}/submit-for-qa`)).status).toBe(422);
  });

  it('QA appears in queue; Developer cannot submit/approve their own QA report', async () => {
    const { qa, dev, t } = await submitted();
    const queue = await api(qa).get('/api/qa/queue');
    expect(queue.body.items.map((x: { id: string }) => x.id)).toContain(t.id);
    expect((await api(dev).get('/api/qa/queue')).status).toBe(403);
    const self = await api(dev).post(`/api/tasks/${t.id}/qa-reports`, goodReport('PASSED'));
    expect(self.status).toBe(403);
  });

  it('a QA user who also submitted the work cannot approve it', async () => {
    const { manager, project } = await setupTeam();
    const qaDev = await makeUser('QA', 'Self Tester');
    await api(manager).post(`/api/projects/${project.id}/members`, { userId: qaDev.id });
    const t = await createTask(manager, project.id, { title: 'Self', qaRequired: true });
    await api(manager).post(`/api/tasks/${t.id}/submit-for-qa`);
    await prisma.task.update({ where: { id: t.id }, data: { submittedById: qaDev.id } });
    expect((await api(qaDev).post(`/api/tasks/${t.id}/qa-reports`, goodReport('PASSED'))).status).toBe(403);
  });

  it('QA pass moves the task to Done with approver recorded', async () => {
    const { qa, dev, manager, t } = await submitted();
    expect((await api(qa).post(`/api/tasks/${t.id}/start-testing`)).body.task.qaStatus).toBe('IN_TESTING');
    const r = await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('PASSED'));
    expect(r.status).toBe(201);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(task.status).toBe('DONE');
    expect(task.qaStatus).toBe('PASSED');
    expect(task.qaApprovedById).toBe(qa.id);
    expect(task.qaApprovedAt).toBeTruthy();
    expect(await prisma.notification.count({ where: { recipientId: dev.id, type: 'QA_PASSED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { recipientId: manager.id, type: 'QA_PASSED' } })).toBe(1);
  });

  it('QA failure reopens and returns the task to the Developer; reports are preserved across retests', async () => {
    const { qa, dev, t } = await submitted();
    // Inconsistent report rejected
    const bad = await api(qa).post(`/api/tasks/${t.id}/qa-reports`, { ...goodReport('FAILED'), overallResult: 'PASSED' });
    expect(bad.status).toBe(400);

    const fail = await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('FAILED'));
    expect(fail.status).toBe(201);
    let task = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(task.qaStatus).toBe('FAILED');
    expect(task.status).toBe('IN_PROGRESS');
    expect(task.assigneeId).toBe(dev.id);
    expect(task.reopenCount).toBe(1);
    expect(task.reopenedAt).toBeTruthy();
    expect(await prisma.notification.count({ where: { recipientId: dev.id, type: 'QA_FAILED' } })).toBe(1);

    // QA cannot re-test until the developer resubmits
    expect((await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('PASSED'))).status).toBe(422);
    // Plain submit is rejected for failed tasks; resubmit requires a fix note
    expect((await api(dev).post(`/api/tasks/${t.id}/submit-for-qa`)).status).toBe(422);
    expect((await api(dev).post(`/api/tasks/${t.id}/resubmit-for-qa`, {})).status).toBe(400);
    const re = await api(dev).post(`/api/tasks/${t.id}/resubmit-for-qa`, { note: 'Fixed the click handler' });
    expect(re.body.task.qaStatus).toBe('AWAITING_QA');

    const pass = await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('PASSED'));
    expect(pass.status).toBe(201);
    task = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(task.status).toBe('DONE');

    const reports = await api(dev).get(`/api/tasks/${t.id}/qa-reports`);
    expect(reports.body.items.map((r: { overallResult: string }) => r.overallResult)).toEqual(['FAILED', 'PASSED']);
    const events = (await prisma.activityEvent.findMany({ where: { taskId: t.id }, orderBy: { createdAt: 'asc' } })).map((e) => e.eventType);
    expect(events).toEqual(
      expect.arrayContaining(['SUBMITTED_FOR_QA', 'QA_REPORT_SUBMITTED', 'QA_FAILED', 'TASK_REOPENED', 'RESUBMITTED_FOR_QA', 'QA_PASSED']),
    );
  });

  it('QA can reopen a task after a previous pass by failing a retest', async () => {
    const { qa, t } = await submitted();
    await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('PASSED'));
    const retest = await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('FAILED'));
    expect(retest.status).toBe(201);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(task.status).toBe('IN_PROGRESS');
    expect(task.qaStatus).toBe('FAILED');
  });

  it('there is no endpoint to modify a submitted report (immutable)', async () => {
    const { qa, t } = await submitted();
    const r = await api(qa).post(`/api/tasks/${t.id}/qa-reports`, goodReport('PASSED'));
    expect((await api(qa).patch(`/api/qa-reports/${r.body.report.id}`, { summary: 'changed' })).status).toBe(404);
    expect((await api(qa).get(`/api/qa-reports/${r.body.report.id}`)).body.report.summary).toBe('Everything works');
  });
});
