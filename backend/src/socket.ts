import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { prisma } from './lib/prisma';
import { AUTH_COOKIE } from './lib/jwt';
import { userFromToken, type AuthUser } from './middleware/auth';
import { corsOrigin } from './app';
import { setIo } from './services/realtime';

/**
 * Socket.IO server.
 * - Connections are authenticated with the same JWT as the REST API (auth.token or HttpOnly cookie).
 * - Each socket joins `user:<id>` and only the `project:<id>` rooms it is authorized for.
 * - Server only emits after changes are committed to PostgreSQL.
 */
export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    const authToken = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;
    const cookieHeader = socket.handshake.headers.cookie;
    const cookieToken = cookieHeader ? parseCookie(cookieHeader)[AUTH_COOKIE] : undefined;
    const user = await userFromToken(authToken || cookieToken).catch(() => null);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user as AuthUser;
    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    const projects = await prisma.project.findMany({
      where: user.role === 'ADMIN' ? {} : { members: { some: { userId: user.id } } },
      select: { id: true },
    });
    for (const p of projects) socket.join(`project:${p.id}`);
    socket.emit('ready', { projects: projects.length });

    // Explicit join (e.g. right after being added to a project) — authorization re-checked server-side.
    socket.on('project:join', async (projectId: unknown, ack?: (ok: boolean) => void) => {
      if (typeof projectId !== 'string') return ack?.(false);
      const allowed =
        user.role === 'ADMIN' ||
        !!(await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } }));
      if (allowed) socket.join(`project:${projectId}`);
      ack?.(allowed);
    });
  });

  setIo(io);
  return io;
}
