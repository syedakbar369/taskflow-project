import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { fmtDate, ROLES, ROLE_LABEL, timeAgo } from '../lib/format';
import type { Paged, Role, User } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, Tabs } from '../components/ui';
import { useToast } from '../components/Toast';

interface TeamMember extends User {
  projects: { id: string; name: string; key: string; color: string }[];
  openTasks: { TODO: number; IN_PROGRESS: number };
}

export default function TeamPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'directory' | 'manage'>(user?.role === 'ADMIN' ? 'manage' : 'directory');
  return (
    <div>
      <PageHeader title="Team" subtitle={user?.role === 'ADMIN' ? 'Invite people, assign roles and manage access.' : 'People you work with across your projects.'} />
      {user?.role === 'ADMIN' && (
        <Tabs
          className="mb-4"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'manage', label: 'User management' },
            { id: 'directory', label: 'Team directory' },
          ]}
        />
      )}
      {tab === 'manage' && user?.role === 'ADMIN' ? <UserManagement /> : <Directory />}
    </div>
  );
}

function Directory() {
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const { data, isLoading, error } = useQuery({
    queryKey: ['team', dq],
    queryFn: async () => (await api.get<{ items: TeamMember[] }>('/team', { params: { q: dq || undefined } })).data.items,
  });
  return (
    <>
      <Input aria-label="Search people" className="mb-4 !h-9 max-w-xs" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={errorMessage(error)} />
      ) : !data?.length ? (
        <Card><EmptyState title="No teammates yet" message="Join a project to see the people you work with." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center gap-3 p-4">
                <Avatar name={m.name} url={m.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{m.name}</p>
                  <p className="truncate text-xs text-slate-500">{m.title || m.email}</p>
                </div>
                <Badge tone="coral">{ROLE_LABEL[m.role]}</Badge>
              </div>
              <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
                <p className="mb-2">
                  Open tasks: <b>{m.openTasks.TODO}</b> to do · <b>{m.openTasks.IN_PROGRESS}</b> in progress
                </p>
                <div className="flex flex-wrap gap-1">
                  {m.projects.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5">
                      <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                      {p.key}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function UserManagement() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'' | Role>('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [inviting, setInviting] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const dq = useDebounce(q, 300);
  const { data, isLoading, error } = useQuery({
    queryKey: ['users', { dq, role, status }],
    queryFn: async () =>
      (await api.get<Paged<User & { _count: { memberships: number; assignedTasks: number } }>>('/users', { params: { q: dq || undefined, role: role || undefined, status, pageSize: 100 } }))
        .data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['users'] });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.patch(`/users/${id}/role`, { role }),
    onSuccess: () => {
      toast('Role updated');
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/users/${id}/status`, { isActive }),
    onSuccess: (_d, v) => {
      toast(v.isActive ? 'User reactivated' : 'User deactivated — their sessions were signed out');
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const reset = useMutation({
    mutationFn: async (u: User) => ({ email: u.email, password: (await api.post<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`, {})).data.temporaryPassword }),
    onSuccess: (s) => setSecret(s),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input aria-label="Search users" className="!h-9 max-w-xs" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Role filter" className="!h-9 !w-auto !py-0 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <Select aria-label="Status filter" className="!h-9 !w-auto !py-0 text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </Select>
        <Button className="ml-auto" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviting(true)}>
          Add user
        </Button>
      </div>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={errorMessage(error)} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Projects</th>
                <th className="px-4 py-2 font-medium">Last sign-in</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data!.items.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'bg-slate-50/70 text-slate-400'}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} url={u.avatarUrl} size={30} />
                      <div>
                        <p className="font-medium text-slate-800">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Select
                      aria-label={`Role for ${u.name}`}
                      className="!h-8 !w-auto !py-0 text-sm"
                      value={u.role}
                      disabled={u.id === me?.id || changeRole.isPending}
                      onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{u._count.memberships}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</td>
                  <td className="px-4 py-2.5">{u.isActive ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}</td>
                  <td className="px-4 py-2.5">
                    {u.id !== me?.id && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={<KeyRound className="h-4 w-4" />} onClick={() => reset.mutate(u)} title="Reset password">
                          Reset
                        </Button>
                        <Button size="sm" variant={u.isActive ? 'secondary' : 'success'} onClick={() => changeStatus.mutate({ id: u.id, isActive: !u.isActive })}>
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {data!.total} users · Created accounts start active. Deactivated users can't sign in and are signed out everywhere.
          </p>
        </Card>
      )}
      <InviteModal open={inviting} onClose={() => setInviting(false)} onCreated={(s) => { refresh(); setSecret(s); }} />
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Temporary password" footer={<Button onClick={() => setSecret(null)}>Done</Button>}>
        <p className="text-sm text-slate-600">
          Share this temporary password with <b>{secret?.email}</b> through a secure channel. It is shown only once; they can change it in Settings.
        </p>
        <p className="mt-3 select-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm">{secret?.password}</p>
      </Modal>
    </>
  );
}

function InviteModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: { email: string; password: string }) => void }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'DEVELOPER' as Role, title: '' });
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: async () => (await api.post<{ user: User; temporaryPassword: string }>('/users', { ...form, title: form.title || undefined })).data,
    onSuccess: (d) => {
      onCreated({ email: d.user.email, password: d.temporaryPassword });
      setForm({ name: '', email: '', role: 'DEVELOPER', title: '' });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Create account
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Full name" htmlFor="u-name">
          <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="u-email">
          <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Role" htmlFor="u-role">
          <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Job title (optional)" htmlFor="u-title">
          <Input id="u-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <p className="text-xs text-slate-500">A secure temporary password will be generated. Created {fmtDate(new Date())}.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
