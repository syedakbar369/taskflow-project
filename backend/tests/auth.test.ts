import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, api, makeUser, PASSWORD, resetDb } from './helpers';
import { prisma } from '../src/lib/prisma';

describe('Authentication', () => {
  beforeEach(resetDb);

  it('first signup becomes Admin, later signups become Developer', async () => {
    const a = await request(app).post('/api/auth/signup').send({ name: 'First User', email: 'First@Example.com', password: 'Secret123' });
    expect(a.status).toBe(201);
    expect(a.body.user.role).toBe('ADMIN');
    expect(a.body.user.email).toBe('first@example.com'); // normalized
    expect(a.body.user.passwordHash).toBeUndefined();
    const b = await request(app).post('/api/auth/signup').send({ name: 'Second', email: 'second@example.com', password: 'Secret123' });
    expect(b.body.user.role).toBe('DEVELOPER');
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await request(app).post('/api/auth/signup').send({ name: 'A User', email: 'a@x.com', password: 'Secret123' });
    const dup = await request(app).post('/api/auth/signup').send({ name: 'A User', email: 'A@x.com', password: 'Secret123' });
    expect(dup.status).toBe(409);
    const weak = await request(app).post('/api/auth/signup').send({ name: 'B User', email: 'b@x.com', password: 'short' });
    expect(weak.status).toBe(400);
  });

  it('logs in with correct credentials and sets an HttpOnly cookie', async () => {
    const u = await makeUser('DEVELOPER');
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(String(res.headers['set-cookie'])).toMatch(/tf_token=.*HttpOnly/);
    const meRes = await api(res.body).get('/api/auth/me');
    expect(meRes.body.user.id).toBe(u.id);
  });

  it('authenticates with the cookie alone', async () => {
    const u = await makeUser('DEVELOPER');
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: u.email, password: PASSWORD }).expect(200);
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
  });

  it('rejects wrong password', async () => {
    const u = await makeUser('DEVELOPER');
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: 'nope-nope1' });
    expect(res.status).toBe(401);
  });

  it('rejects inactive users at login and revokes existing sessions', async () => {
    const admin = await makeUser('ADMIN');
    const u = await makeUser('DEVELOPER');
    expect((await api(u).get('/api/auth/me')).status).toBe(200);
    const deact = await api(admin).patch(`/api/users/${u.id}/status`, { isActive: false });
    expect(deact.status).toBe(200);
    expect((await api(u).get('/api/auth/me')).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD });
    expect(login.status).toBe(403);
  });

  it('logout revokes the token', async () => {
    const u = await makeUser('QA');
    expect((await api(u).post('/api/auth/logout')).status).toBe(200);
    expect((await api(u).get('/api/auth/me')).status).toBe(401);
  });

  it('requires auth for protected routes', async () => {
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/projects').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });

  it('only Admin can manage users and roles', async () => {
    const admin = await makeUser('ADMIN');
    const manager = await makeUser('MANAGER');
    const dev = await makeUser('DEVELOPER');
    expect((await api(dev).get('/api/users')).status).toBe(403);
    expect((await api(manager).get('/api/users')).status).toBe(200);
    expect((await api(manager).patch(`/api/users/${dev.id}/role`, { role: 'ADMIN' })).status).toBe(403);
    const created = await api(admin).post('/api/users', { name: 'New Person', email: 'new@x.com', role: 'QA' });
    expect(created.status).toBe(201);
    expect(created.body.temporaryPassword).toBeTruthy();
    const role = await api(admin).patch(`/api/users/${dev.id}/role`, { role: 'MANAGER' });
    expect(role.body.user.role).toBe('MANAGER');
    // Cannot demote the last admin
    expect((await api(admin).patch(`/api/users/${admin.id}/role`, { role: 'QA' })).status).toBe(400);
    expect(await prisma.activityEvent.count({ where: { eventType: 'USER_ROLE_CHANGED' } })).toBe(1);
  });
});
