import type { Server } from 'socket.io';

let io: Server | null = null;

export function setIo(server: Server | null) {
  io = server;
}

export function getIo() {
  return io;
}

export interface ProjectChange {
  type: string;
  projectId: string;
  taskId?: string;
  actorId?: string;
}

/** Broadcast a lightweight change event to authorized viewers of a project. Clients re-fetch what they need. */
export function broadcastProject(change: ProjectChange) {
  io?.to(`project:${change.projectId}`).emit('project:changed', change);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

/** Make all sockets of a user join/leave a project room (after membership changes). */
export function syncUserProjectRoom(userId: string, projectId: string, join: boolean) {
  if (!io) return;
  const target = io.in(`user:${userId}`);
  if (join) target.socketsJoin(`project:${projectId}`);
  else target.socketsLeave(`project:${projectId}`);
}

export function joinAdminsToProject(projectId: string) {
  io?.in('role:ADMIN').socketsJoin(`project:${projectId}`);
}
