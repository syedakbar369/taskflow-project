import { io, type Socket } from 'socket.io-client';
import { API_URL, tokenStore } from './api';

let socket: Socket | null = null;

/**
 * Single authenticated Socket.IO connection (JWT in the handshake; cookie as fallback).
 * WebSocket transport only: on Vercel, HTTP long-polling requests could land on different
 * function instances, so the docs require `transports: ['websocket']`.
 * Connections are closed when the function reaches its max duration; Socket.IO reconnects
 * automatically and useRealtime() re-fetches data after every reconnect.
 */
export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL || undefined, {
    path: import.meta.env.VITE_SOCKET_PATH || '/socket.io',
    transports: ['websocket'],
    withCredentials: true,
    auth: (cb) => cb({ token: tokenStore.get() }),
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
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
