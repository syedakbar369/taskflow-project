import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage, tokenStore } from '../lib/api';
import { ROLE_LABEL } from '../lib/format';
import type { Label, User } from '../lib/types';
import { Avatar, Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { validatePassword } from './Signup';

export default function SettingsPage() {
  const { user, hasRole } = useAuth();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Manage your profile and workspace preferences." />
      <div className="space-y-4">
        <ProfileCard />
        <PasswordCard />
        {hasRole('ADMIN', 'MANAGER') && <LabelsCard />}
        <Card title="Your access">
          <div className="space-y-2 p-4 text-sm text-slate-600">
            <p>
              Role: <Badge tone="coral">{user && ROLE_LABEL[user.role]}</Badge>
            </p>
            <p>
              {user?.role === 'ADMIN' && 'You can manage users, roles, every project, and view all reports and audit history.'}
              {user?.role === 'MANAGER' && 'You can create projects, manage members, create and assign tasks, and view reports for your projects.'}
              {user?.role === 'QA' && 'You can test submitted work, write test reports, upload evidence, and pass or fail tasks.'}
              {user?.role === 'DEVELOPER' && 'You can work on assigned tasks, comment, upload files and submit work for QA.'}
            </p>
            <p className="text-xs text-slate-500">Need different access? Ask an Admin to change your role.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProfileCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const save = useMutation({
    mutationFn: async () => (await api.patch<{ user: User }>('/auth/me', { name: name.trim(), title: title.trim() || null, avatarUrl: avatarUrl.trim() || null })).data.user,
    onSuccess: (u) => {
      setUser(u);
      toast('Profile saved');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Card title="Profile">
      <form
        className="grid gap-4 p-4 sm:grid-cols-[auto_1fr]"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Avatar name={name || 'You'} url={avatarUrl || null} size={64} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="s-name">
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Job title" htmlFor="s-title">
            <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Frontend Developer" />
          </Field>
          <Field label="Email" htmlFor="s-email" hint="Contact an Admin to change your email.">
            <Input id="s-email" value={user?.email ?? ''} disabled />
          </Field>
          <Field label="Avatar image URL (optional)" htmlFor="s-avatar">
            <Input id="s-avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save profile
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const change = useMutation({
    mutationFn: async () => (await api.post<{ token: string }>('/auth/change-password', { currentPassword: current, newPassword: next })).data,
    onSuccess: (d) => {
      tokenStore.set(d.token);
      setCurrent('');
      setNext('');
      setError('');
      toast('Password changed. Other sessions were signed out.');
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = validatePassword(next);
    if (err) return setError(err);
    change.mutate();
  };
  return (
    <Card title="Change password">
      <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="pw-current">
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="pw-new" hint="At least 8 characters with a letter and a number.">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" loading={change.isPending} disabled={!current || !next}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LabelsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#F06A4A');
  const { data } = useQuery({ queryKey: ['labels'], queryFn: async () => (await api.get<{ items: (Label & { _count: { tasks: number } })[] }>('/labels')).data.items });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['labels'] });
  const add = useMutation({
    mutationFn: () => api.post('/labels', { name: name.trim(), color }),
    onSuccess: () => {
      setName('');
      refresh();
      toast('Label created');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/labels/${id}`), onSuccess: refresh, onError: (e) => toast(errorMessage(e), 'error') });
  return (
    <Card title="Labels">
      <div className="p-4">
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate();
          }}
        >
          <Field label="New label" htmlFor="l-name">
            <Input id="l-name" className="!h-9" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="e.g. Security" />
          </Field>
          <Field label="Color" htmlFor="l-color">
            <input id="l-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200" />
          </Field>
          <Button type="submit" size="sm" className="!h-9" loading={add.isPending} disabled={!name.trim()}>
            Add label
          </Button>
        </form>
        <ul className="flex flex-wrap gap-2">
          {data?.map((l) => (
            <li key={l.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
              {l.name}
              <span className="text-xs text-slate-400">{l._count.tasks}</span>
              <button aria-label={`Delete label ${l.name}`} className="text-slate-400 hover:text-red-600" onClick={() => del.mutate(l.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
