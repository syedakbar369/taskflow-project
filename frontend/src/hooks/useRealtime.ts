import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth/AuthContext';
import type { Notification } from '../lib/types';

interface ProjectChange {
  type: string;
  projectId: string;
  taskId?: string;
  actorId?: string;
}

/** Keeps React Query caches in sync with server events; re-fetches everything after reconnects. */
export function useRealtime() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket();
    let wasConnected = false;

    const onConnect = () => {
      setStatus('live');
      if (wasConnected) void qc.invalidateQueries(); // reconnect: refresh all visible data
      wasConnected = true;
    };
    const onDisconnect = () => setStatus('offline');
    const onError = () => setStatus('offline');

    const onProjectChanged = (c: ProjectChange) => {
      const keys: unknown[][] = [
        ['tasks', c.projectId],
        ['project', c.projectId],
        ['projects'],
        ['dashboard'],
        ['my-tasks'],
        ['qa-queue'],
        ['qa-reports-list'],
        ['reports'],
        ['activity'],
        ['project-activity', c.projectId],
      ];
      if (c.taskId) {
        keys.push(['task', c.taskId], ['comments', c.taskId], ['attachments', c.taskId], ['qa-reports', c.taskId], ['task-activity', c.taskId]);
      }
      for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
    };

    const onNotification = (n: Notification) => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      toast(n.message, 'info');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.on('project:changed', onProjectChanged);
    socket.on('notification:new', onNotification);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.off('project:changed', onProjectChanged);
      socket.off('notification:new', onNotification);
    };
  }, [user, qc, toast]);

  // Fallback: while the socket is down (e.g. serverless reconnect in progress), refresh visible data every 30s.
  useEffect(() => {
    if (!user || status === 'live') return;
    const t = setInterval(() => void qc.invalidateQueries({ type: 'active' }), 30_000);
    return () => clearInterval(t);
  }, [status, user, qc]);

  useEffect(() => () => disconnectSocket(), []);
  return status;
}
