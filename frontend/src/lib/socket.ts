import { io, type Socket } from 'socket.io-client';
import { API_URL, tokenStore } from './api';

let socket: Socket | null = null;

/** Single authenticated Socket.IO connection (JWT in the handshake; cookie as fallback). */
export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL || undefined, {
    path: '/socket.io',
    withCredentials: true,
    auth: (cb) => cb({ token: tokenStore.get() }),
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket() {
  return socket;
}
