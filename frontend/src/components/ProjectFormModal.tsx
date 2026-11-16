import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { PROJECT_STATUS_LABEL, toDateInput } from '../lib/format';
import type { Project, ProjectStatus, User } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Avatar, Button, Field, Input, Modal, Select, Textarea } from './ui';
import { useToast } from './Toast';

const COLORS = ['#F06A4A', '#16A34A', '#0E7490', '#DB7706', '#BE123C', '#475569'];

export default function ProjectFormModal({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: Project; onSaved?: (p: Project) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(() => init(project));
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setForm(init(project));
      setError('');
    }
  }, [open, project]);

  const { data: users } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: async () => (await api.get<{ items: User[] }>('/users', { params: { status: 'active', pageSize: 100 } })).data.items,
    enabled: open && !project,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        key: form.key.trim() ? form.key.trim().toUpperCase() : undefined,
        description: form.description.trim() || null,
        status: form.status,
        color: form.color,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
      };
      if (project) return (await api.patch<{ project: Project }>(`/projects/${project.id}`, body)).data.project;
      return (await api.post<{ project: Project }>('/projects', { ...body, memberIds: form.memberIds })).data.project;
    },
    onSuccess: (p) => {
      toast(project ? 'Project updated' : `Project “${p.name}” created`);
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['project', p.id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onSaved?.(p);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError('Project name is required.');
    if (form.key && !/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(form.key)) return setError('Key must be 2–10 letters/numbers and start with a letter.');
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) return setError('Target date must be after the start date.');
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Edit project' : 'Create project'}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={save.isPending}>
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Project name" htmlFor="p-name" className="sm:col-span-2">
          <Input id="p-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website Redesign" />
        </Field>
        <Field label="Key (optional)" htmlFor="p-key" hint="Short code used in task IDs, e.g. WEB-12. Generated if empty.">
          <Input id="p-key" value={form.key} maxLength={10} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} placeholder="WEB" />
        </Field>
        <Field label="Status" htmlFor="p-status">
          <Select id="p-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
          <Textarea id="p-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this project about?" />
        </Field>
        <Field label="Start date" htmlFor="p-start">
          <Input id="p-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Target date" htmlFor="p-due">
          <Input id="p-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Color</legend>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={`Color ${c}`}
                aria-pressed={form.color === c}
                onClick={() => setForm({ ...form, color: c })}
                className={`h-7 w-7 rounded-full ring-offset-2 ${form.color === c ? 'ring-2 ring-slate-700' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
        {!project && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Members</legend>
            <p className="mb-2 text-xs text-slate-500">You are added automatically. You can add more people later.</p>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
              {users
                ?.filter((u) => u.id !== user?.id)
                .map((u) => (
                  <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-coral-600"
                      checked={form.memberIds.includes(u.id)}
                      onChange={(e) =>
                        setForm({ ...form, memberIds: e.target.checked ? [...form.memberIds, u.id] : form.memberIds.filter((x) => x !== u.id) })
                      }
                    />
                    <Avatar name={u.name} size={20} />
                    <span className="truncate">{u.name}</span>
                    <span className="ml-auto text-xs text-slate-400">{u.role.toLowerCase()}</span>
                  </label>
                ))}
            </div>
          </fieldset>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function init(p?: Project) {
  return {
    name: p?.name ?? '',
    key: p?.key ?? '',
    description: p?.description ?? '',
    status: (p?.status ?? 'ACTIVE') as ProjectStatus,
    color: p?.color ?? COLORS[0]!,
    startDate: toDateInput(p?.startDate),
    dueDate: toDateInput(p?.dueDate),
    memberIds: [] as string[],
  };
}
