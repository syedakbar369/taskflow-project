import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, toDateInput } from '../lib/format';
import type { Label, Priority, Task, TaskStatus, UserMini } from '../lib/types';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { useToast } from './Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  project: { id: string; name: string; members: { user: UserMini }[] };
  task?: Task; // edit mode
  defaultStatus?: TaskStatus;
  onSaved?: (t: Task) => void;
}

export default function TaskFormModal({ open, onClose, project, task, defaultStatus, onSaved }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(() => initial(task, defaultStatus));
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setForm(initial(task, defaultStatus));
      setError('');
    }
  }, [open, task, defaultStatus]);

  const { data: labels } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => (await api.get<{ items: Label[] }>('/labels')).data.items,
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        qaAssigneeId: form.qaRequired ? form.qaAssigneeId || null : null,
        dueDate: form.dueDate || null,
        startDate: form.startDate || null,
        qaRequired: form.qaRequired,
        labelIds: form.labelIds,
      };
      if (task) return (await api.patch<{ task: Task }>(`/tasks/${task.id}`, payload)).data.task;
      return (await api.post<{ task: Task }>(`/projects/${project.id}/tasks`, { ...payload, status: form.status })).data.task;
    },
    onSuccess: (t) => {
      toast(task ? 'Task updated' : `Created ${t.key}`);
      void qc.invalidateQueries({ queryKey: ['tasks', project.id] });
      void qc.invalidateQueries({ queryKey: ['task', t.id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onSaved?.(t);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('Give the task a title.');
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) return setError('Due date must be after the start date.');
    save.mutate();
  };

  const members = project.members.map((m) => m.user);
  const testers = members.filter((u) => u.role === 'QA' || u.role === 'ADMIN');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? `Edit ${task.key}` : `New task in ${project.name}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" loading={save.isPending}>
            {task ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Title" htmlFor="t-title" className="sm:col-span-2">
          <Input id="t-title" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" maxLength={200} />
        </Field>
        <Field label="Description" htmlFor="t-desc" hint="Markdown supported (lists, **bold**, `code`)." className="sm:col-span-2">
          <Textarea id="t-desc" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Add details, acceptance criteria, links…" />
        </Field>
        {!task && (
          <Field label="Status" htmlFor="t-status">
            <Select id="t-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
              {STATUSES.filter((s) => !(form.qaRequired && s === 'DONE')).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Priority" htmlFor="t-priority">
          <Select id="t-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee" htmlFor="t-assignee" hint="Only project members can be assigned.">
          <Select id="t-assignee" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
            <option value="">Unassigned</option>
            {members.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role.toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start date" htmlFor="t-start">
          <Input id="t-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Due date" htmlFor="t-due">
          <Input id="t-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Field>
        <div className="space-y-2 rounded-lg border border-slate-200 p-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-coral-600 focus:ring-coral-400"
              checked={form.qaRequired}
              onChange={(e) => setForm({ ...form, qaRequired: e.target.checked, status: e.target.checked && form.status === 'DONE' ? 'TODO' : form.status })}
            />
            QA required
          </label>
          <p className="text-xs text-slate-500">The task can only be completed after a QA tester submits a Passed test report.</p>
          {form.qaRequired && (
            <Field label="QA tester (optional)" htmlFor="t-qa">
              <Select id="t-qa" value={form.qaAssigneeId} onChange={(e) => setForm({ ...form, qaAssigneeId: e.target.value })}>
                <option value="">Any QA member of the project</option>
                {testers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Labels</legend>
          <div className="flex flex-wrap gap-1.5">
            {labels?.length === 0 && <p className="text-xs text-slate-500">No labels yet. Admins and Managers can create them in Settings.</p>}
            {labels?.map((l) => {
              const on = form.labelIds.includes(l.id);
              return (
                <button
                  type="button"
                  key={l.id}
                  aria-pressed={on}
                  onClick={() => setForm({ ...form, labelIds: on ? form.labelIds.filter((x) => x !== l.id) : [...form.labelIds, l.id] })}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${on ? 'border-coral-300 bg-coral-50 text-coral-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function initial(task?: Task, defaultStatus?: TaskStatus) {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: (defaultStatus ?? 'TODO') as TaskStatus,
    priority: (task?.priority ?? 'MEDIUM') as Priority,
    assigneeId: task?.assigneeId ?? '',
    qaAssigneeId: task?.qaAssigneeId ?? '',
    startDate: toDateInput(task?.startDate),
    dueDate: toDateInput(task?.dueDate),
    qaRequired: task?.qaRequired ?? false,
    labelIds: task?.labels.map((l) => l.id) ?? [],
  };
}
