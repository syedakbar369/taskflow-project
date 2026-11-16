import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { Server } from 'socket.io';
import { app, api, createTask, resetDb, setupTeam } from './helpers';
import { createApp } from '../src/app';
import { setIo } from '../src/services/realtime';
import { adapterReady, createSocketServer } from '../src/socket';
import vercelServer from '../api/server';

describe('Vercel Cron endpoint', () => {
  beforeEach(resetDb);
  it('requires the CRON_SECRET bearer token', async () => {
    expect((await request(app).get('/api/cron/due-dates')).status).toBe(401);
    expect((await request(app).get('/api/cron/due-dates').set('Authorization', 'Bearer wrong')).status).toBe(401);
    const ok = await request(app).get('/api/cron/due-dates').set('Authorization', 'Bearer test-cron-secret');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, dueSoon: 0, overdue: 0 });
  });
});

describe('Vercel function entry (api/server.ts)', () => {
  it('exports an http.Server serving the API and Socket.IO', async () => {
    const server = vercelServer;
    expect(server).toBeInstanceOf(http.Server);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    const health = (await fetch(`http://localhost:${port}/api/health`).then((r) => r.json())) as { ok: boolean };
    expect(health.ok).toBe(true);
    // Socket.IO answers the WebSocket handshake path (unauthenticated -> rejected, proving the server is attached).
    const err = await new Promise<Error>((resolve) => {
      const s = ioClient(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false, auth: { token: 'x' } });
      s.on('connect_error', (e) => {
        s.close();
        resolve(e);
      });
    });
    expect(err.message).toBe('unauthorized');
    await new Promise((r) => server.close(r));
    setIo(null);
  });
});

// Two independent server instances sharing Redis = two Vercel function instances.
// Runs only when TEST_REDIS_URL is set (e.g. docker run -p 6379:6379 redis:7-alpine).
const redisUrl = process.env.TEST_REDIS_URL;
describe.skipIf(!redisUrl)('Socket.IO across instances via Redis adapter', () => {
  const servers: http.Server[] = [];
  const ios: Server[] = [];
  afterAll(async () => {
    ios.forEach((i) => i.close());
    setIo(null);
  });

  async function instance() {
    const server = http.createServer(createApp());
    const ioServer = createSocketServer(server, { redisUrl });
    await adapterReady.get(ioServer);
    await new Promise<void>((r) => server.listen(0, r));
    servers.push(server);
    ios.push(ioServer);
    return { server, ioServer, url: `http://localhost:${(server.address() as AddressInfo).port}` };
  }

  it('an event emitted on instance B reaches a client connected to instance A', async () => {
    await resetDb();
    const { manager, dev, project } = await setupTeam();
    const t = await createTask(manager, project.id, { title: 'Cross-instance', assigneeId: dev.id });
    const a = await instance();
    const b = await instance(); // realtime.ts now points at B's io (the "instance" handling the REST call)
    const client: Socket = ioClient(a.url, { transports: ['websocket'], auth: { token: manager.token }, reconnection: false });
    await new Promise<void>((r) => client.on('ready', () => r()));
    const got = new Promise<{ taskId: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no cross-instance event')), 5000);
      client.once('project:changed', (p) => {
        clearTimeout(timer);
        resolve(p);
      });
    });
    expect((await api(dev).patch(`/api/tasks/${t.id}/status`, { status: 'IN_PROGRESS' })).status).toBe(200);
    expect((await got).taskId).toBe(t.id);
    client.close();
    void b;
  });
});
