import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Role } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();
export const PASSWORD = 'Password123!';
const hash = bcrypt.hashSync(PASSWORD, 4);

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Notification","ActivityEvent","Attachment","QATestCase","QAReport","Comment","TaskLabel","Task","Label","ProjectMember","Project","User" RESTART IDENTITY CASCADE',
  );
}

export async function makeUser(role: Role, name = role.toLowerCase()) {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
  const user = await prisma.user.create({ data: { name, email, role, passwordHash: hash } });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...user, token: res.body.token as string };
}

export type TestUser = Awaited<ReturnType<typeof makeUser>>;

export const api = (u: { token: string }) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${u.token}`),
  post: (url: string, body?: object) =>
    request(app)
      .post(url)
      .set('Authorization', `Bearer ${u.token}`)
      .send(body ?? {}),
  patch: (url: string, body?: object) =>
    request(app)
      .patch(url)
      .set('Authorization', `Bearer ${u.token}`)
      .send(body ?? {}),
  delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${u.token}`),
  upload: (url: string) => request(app).post(url).set('Authorization', `Bearer ${u.token}`),
});

/** Standard team: admin, manager, qa, dev, outsider + one project with all but outsider as members. */
export async function setupTeam() {
  const admin = await makeUser('ADMIN', 'Alice Admin');
  const manager = await makeUser('MANAGER', 'Mike Manager');
  const qa = await makeUser('QA', 'Quinn Tester');
  const dev = await makeUser('DEVELOPER', 'Dana Dev');
  const outsider = await makeUser('DEVELOPER', 'Oscar Outsider');
  const res = await api(manager).post('/api/projects', { name: 'Demo Project', key: 'DEMO', memberIds: [qa.id, dev.id] });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return { admin, manager, qa, dev, outsider, project: res.body.project as { id: string; key: string } };
}

export async function createTask(manager: TestUser, projectId: string, body: object) {
  const res = await api(manager).post(`/api/projects/${projectId}/tasks`, { title: 'Task', ...body });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.task as { id: string; key: string; status: string; qaStatus: string };
}

export const goodReport = (overallResult: 'PASSED' | 'FAILED') => ({
  title: `Test run (${overallResult})`,
  summary: overallResult === 'PASSED' ? 'Everything works' : 'Button does nothing on click',
  overallResult,
  testCases: [
    {
      title: 'Click save',
      steps: '1. open\n2. click',
      expectedResult: 'Saved',
      actualResult: overallResult === 'PASSED' ? 'Saved' : 'Nothing happens',
      result: overallResult,
    },
  ],
});
