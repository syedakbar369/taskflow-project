import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokenStore } from '../lib/api';
import { disconnectSocket } from '../lib/socket';
import type { Role, User } from '../lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => {
      setUser(null);
      disconnectSocket();
    };
    window.addEventListener('tf:unauthorized', onUnauthorized);
    return () => window.removeEventListener('tf:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ user: User; token: string }>('/auth/login', { email, password });
    tokenStore.set(data.token);
    qc.clear();
    setUser(data.user);
    return data.user;
  }, [qc]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await api.post<{ user: User; token: string }>('/auth/signup', { name, email, password });
    tokenStore.set(data.token);
    qc.clear();
    setUser(data.user);
    return data.user;
  }, [qc]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* already logged out */
    }
    tokenStore.clear();
    disconnectSocket();
    qc.clear();
    setUser(null);
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      signup,
      logout,
      refresh,
      setUser,
      hasRole: (...roles: Role[]) => !!user && roles.includes(user.role),
    }),
    [user, loading, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
