import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bell,
  BarChart3,
  CheckSquare,
  ChevronDown,
  ClipboardCheck,
  FolderKanban,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { ROLE_LABEL, timeAgo } from '../lib/format';
import { enter } from '../lib/motion';
import type { Notification, Role, TaskStatus } from '../lib/types';
import { useRealtime } from '../hooks/useRealtime';
import { useDebounce } from '../hooks/useDebounce';
import { Avatar } from './ui';
import { StatusDot } from './TaskBits';
import TaskDrawer from './TaskDrawer';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
  badge?: number;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('flex items-center gap-2 font-semibold text-slate-900', className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-coral-500 text-white">
        <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden>
          <path d="M8 16.5l5 5L24 10.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      TaskFlow
    </span>
  );
}

const PAGE_TITLES: [RegExp, string][] = [
  [/^\/$/, 'Overview'],
  [/^\/my-tasks/, 'My Tasks'],
  [/^\/projects\/.+/, 'Project'],
  [/^\/projects/, 'Projects'],
  [/^\/team/, 'Team'],
  [/^\/qa/, 'QA Center'],
  [/^\/reports/, 'Reports'],
  [/^\/notifications/, 'Notifications'],
  [/^\/activity/, 'Activity log'],
  [/^\/settings/, 'Settings'],
];

export default function Layout() {
  const { user } = useAuth();
  const live = useRealtime();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const taskId = params.get('task');
  const mainRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const { data: notif } = useQuery({
    queryKey: ['notifications', 'summary'],
    queryFn: async () => (await api.get<{ items: Notification[]; unreadCount: number }>('/notifications', { params: { pageSize: 8 } })).data,
    refetchInterval: 60_000,
  });

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => enter(mainRef.current, { y: 6 }), [location.pathname]);
  useEffect(() => enter(sidebarRef.current, { y: 0 }), []);

  if (!user) return null;
  const nav: NavItem[] = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/my-tasks', label: 'My Tasks', icon: CheckSquare },
    { to: '/projects', label: 'Projects', icon: FolderKanban },
    { to: '/team', label: 'Team', icon: Users },
    { to: '/qa', label: 'QA Center', icon: ClipboardCheck, roles: ['QA', 'MANAGER', 'ADMIN'] },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: notif?.unreadCount },
    { to: '/activity', label: 'Activity log', icon: History, roles: ['ADMIN', 'MANAGER'] },
    { to: '/settings', label: 'Settings', icon: Settings },
  ].filter((n) => !n.roles || n.roles.includes(user.role)) as NavItem[];

  const title = PAGE_TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'TaskFlow';

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <Link to="/" className="mb-4 px-2 py-1">
        <Logo />
      </Link>
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-coral-50 text-coral-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <n.icon className="h-4 w-4" aria-hidden />
          <span className="flex-1">{n.label}</span>
          {!!n.badge && <span className="rounded-full bg-coral-500 px-1.5 text-xs font-semibold text-white">{n.badge > 99 ? '99+' : n.badge}</span>}
        </NavLink>
      ))}
      <div className="mt-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        Signed in as <span className="font-medium text-slate-700">{ROLE_LABEL[user.role]}</span>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside ref={sidebarRef} className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-64 bg-white shadow-pop" onClick={(e) => e.stopPropagation()}>
            <button className="absolute left-56 top-3 rounded-md bg-white p-1 text-slate-500" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <nav aria-label="Breadcrumb" className="hidden text-sm text-slate-500 sm:block">
            <span>Workspace</span>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="font-medium text-slate-800">{title}</span>
          </nav>
          <div className="flex flex-1 justify-end gap-2 sm:justify-center">
            <GlobalSearch />
          </div>
          <span
            className={clsx('hidden items-center gap-1.5 text-xs sm:flex', live === 'live' ? 'text-green-700' : 'text-slate-400')}
            title={live === 'live' ? 'Real-time updates connected' : 'Reconnecting to real-time updates…'}
          >
            <span className={clsx('h-2 w-2 rounded-full', live === 'live' ? 'bg-green-500' : 'bg-slate-300')} />
            {live === 'live' ? 'Live' : 'Offline'}
          </span>
          <NotificationBell data={notif} />
          <UserMenu />
        </header>
        <main ref={mainRef} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
      <TaskDrawer
        taskId={taskId}
        onClose={() => {
          params.delete('task');
          setParams(params, { replace: true });
        }}
      />
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(q.trim(), 250);
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const boxRef = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: async () =>
      (
        await api.get<{
          projects: { id: string; name: string; key: string; color: string }[];
          tasks: { id: string; key: string; title: string; status: TaskStatus; project: { name: string } }[];
        }>('/search', { params: { q: debounced } })
      ).data,
    enabled: debounced.length > 1,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Search tasks and projects…"
        aria-label="Search tasks and projects"
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:border-coral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-coral-100"
      />
      {open && debounced.length > 1 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-pop">
          {isFetching && !data && <p className="p-3 text-sm text-slate-500">Searching…</p>}
          {data && data.projects.length === 0 && data.tasks.length === 0 && <p className="p-3 text-sm text-slate-500">No results for “{debounced}”.</p>}
          {data && data.projects.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Projects</p>
              {data.projects.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    setOpen(false);
                    setQ('');
                    navigate(`/projects/${p.id}`);
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
                  {p.name}
                  <span className="ml-auto text-xs text-slate-400">{p.key}</span>
                </button>
              ))}
            </>
          )}
          {data && data.tasks.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tasks</p>
              {data.tasks.map((t) => (
                <button
                  key={t.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    setOpen(false);
                    setQ('');
                    setParams((p) => {
                      p.set('task', t.id);
                      return p;
                    });
                  }}
                >
                  <StatusDot status={t.status} />
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-400">{t.key}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell({ data }: { data?: { items: Notification[]; unreadCount: number } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [, setParams] = useSearchParams();
  const navigate = useNavigate();
  const readAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readOne = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const unread = data?.unreadCount ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button className="text-xs font-medium text-coral-700 hover:underline" onClick={() => readAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!data?.items.length && <p className="p-4 text-center text-sm text-slate-500">You're all caught up.</p>}
            {data?.items.map((n) => (
              <button
                key={n.id}
                className={clsx('flex w-full gap-2 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50', !n.readAt && 'bg-coral-50/40')}
                onClick={() => {
                  if (!n.readAt) readOne.mutate(n.id);
                  setOpen(false);
                  if (n.relatedTaskId) {
                    setParams((p) => {
                      p.set('task', n.relatedTaskId!);
                      return p;
                    });
                  } else if (n.relatedProjectId) navigate(`/projects/${n.relatedProjectId}`);
                }}
              >
                {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-coral-500" aria-label="Unread" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                  <span className="block truncate text-xs text-slate-500">{n.message}</span>
                  <span className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-3 py-2 text-center text-sm font-medium text-coral-700 hover:bg-slate-50">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={user.name} url={user.avatarUrl} size={30} />
        <span className="hidden text-left md:block">
          <span className="block text-sm font-medium leading-tight text-slate-800">{user.name}</span>
          <span className="block text-xs leading-tight text-slate-500">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-pop">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-50">
            <Settings className="h-4 w-4" /> Profile & settings
          </Link>
          <Link role="menuitem" to="/logout" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" /> Log out
          </Link>
        </div>
      )}
    </div>
  );
}
