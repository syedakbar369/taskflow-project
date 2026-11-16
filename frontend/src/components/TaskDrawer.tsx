import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';
import {
  Archive,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { api, downloadAttachment, errorMessage, previewAttachment } from '../lib/api';
import { fileSize, fmtDate, fmtDateTime, QA_LABEL, STATUSES, STATUS_LABEL, timeAgo } from '../lib/format';
import type { ActivityEvent, Attachment, Comment, QAReport, Task, TaskPermissions, TaskStatus, UserMini } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Avatar, Badge, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, Field, Modal, Select, Spinner, Tabs, Textarea } from './ui';
import { DueLabel, LabelChip, PriorityBadge, QABadge, StatusBadge } from './TaskBits';
import { useToast } from './Toast';
import TaskFormModal from './TaskFormModal';
import QAReportForm from './QAReportForm';
import ActivityList from './ActivityList';
import { FilePicker, ProgressBar } from './FileUploader';

type Tab = 'overview' | 'comments' | 'qa' | 'files' | 'activity';
interface Detail {
  task: Task;
  permissions: TaskPermissions;
  members: UserMini[];
}

export default function TaskDrawer({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  return (
    <Drawer open={!!taskId} onClose={onClose} label="Task details">
      {taskId && <TaskDetail key={taskId} taskId={taskId} onClose={onClose} />}
    </Drawer>
  );
}

function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [qaFormOpen, setQaFormOpen] = useState(false);
  const [submitMode, setSubmitMode] = useState<null | 'submit' | 'resubmit'>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => (await api.get<Detail>(`/tasks/${taskId}`)).data,
  });

  const invalidate = (t?: Task) => {
    void qc.invalidateQueries({ queryKey: ['task', taskId] });
    if (t) void qc.invalidateQueries({ queryKey: ['tasks', t.projectId] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['qa-queue'] });
    void qc.invalidateQueries({ queryKey: ['task-activity', taskId] });
  };

  const move = useMutation({
    mutationFn: async (status: TaskStatus) => (await api.patch<{ task: Task }>(`/tasks/${taskId}/status`, { status })).data.task,
    onSuccess: (t) => {
      toast(`Moved to ${STATUS_LABEL[t.status]}`);
      invalidate(t);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const startTesting = useMutation({
    mutationFn: async () => (await api.post<{ task: Task }>(`/tasks/${taskId}/start-testing`)).data.task,
    onSuccess: (t) => {
      toast('Testing started');
      invalidate(t);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const archive = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/archive`),
    onSuccess: () => {
      toast('Task archived');
      if (data) invalidate(data.task);
      onClose();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  useEffect(() => {
    if (qaFormOpen) setTab('qa');
  }, [qaFormOpen]);

  if (isLoading) return <Spinner />;
  if (error || !data)
    return (
      <div className="p-6">
        <div className="mb-4 flex justify-end">
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ErrorState message={errorMessage(error, 'Could not load this task.')} onRetry={() => void refetch()} />
      </div>
    );

  const { task, permissions: p, members } = data;

  return (
    <>
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <Link to={`/projects/${task.projectId}`} onClick={onClose} className="flex items-center gap-1.5 hover:text-slate-800">
            <span className="h-2 w-2 rounded-sm" style={{ background: task.project.color }} />
            {task.project.name}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-medium">{task.key}</span>
          <button onClick={onClose} aria-label="Close task" className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 className="text-lg font-semibold leading-snug text-slate-900">{task.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <QABadge status={task.qaStatus} />
          {task.reopenCount > 0 && (
            <Badge tone="red">
              <RotateCcw className="h-3 w-3" /> Reopened {task.reopenCount}×
            </Badge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.canMove && (
            <Select
              aria-label="Change status"
              className="!h-8 !w-auto !py-0 text-sm"
              value={task.status}
              disabled={move.isPending}
              onChange={(e) => move.mutate(e.target.value as TaskStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} disabled={s === 'DONE' && !p.canComplete && task.status !== 'DONE'}>
                  {STATUS_LABEL[s]}
                  {s === 'DONE' && !p.canComplete && task.status !== 'DONE' ? ' (needs QA pass)' : ''}
                </option>
              ))}
            </Select>
          )}
          {p.canSubmitForQa && (
            <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={() => setSubmitMode('submit')}>
              Submit for QA
            </Button>
          )}
          {p.canResubmitForQa && (
            <Button size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setSubmitMode('resubmit')}>
              Resubmit for QA
            </Button>
          )}
          {p.canStartTesting && (
            <Button size="sm" variant="secondary" icon={<Play className="h-4 w-4" />} loading={startTesting.isPending} onClick={() => startTesting.mutate()}>
              Start testing
            </Button>
          )}
          {p.canSubmitQaReport && !qaFormOpen && (
            <Button size="sm" icon={<FlaskConical className="h-4 w-4" />} onClick={() => setQaFormOpen(true)}>
              {task.qaStatus === 'PASSED' ? 'Retest' : 'Create test report'}
            </Button>
          )}
          <span className="ml-auto flex gap-1">
            {p.canEdit && (
              <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {p.canArchive && (
              <Button size="sm" variant="ghost" aria-label="Archive task" icon={<Archive className="h-4 w-4" />} onClick={() => setArchiveOpen(true)} />
            )}
          </span>
        </div>
      </header>

      <Tabs<Tab>
        className="px-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'comments', label: `Comments${task._count.comments ? ` (${task._count.comments})` : ''}` },
          { id: 'qa', label: `QA & Test Reports${task._count.qaReports ? ` (${task._count.qaReports})` : ''}` },
          { id: 'files', label: `Attachments${task._count.attachments ? ` (${task._count.attachments})` : ''}` },
          { id: 'activity', label: 'Activity' },
        ]}
      />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === 'overview' && <Overview task={task} onShowQa={() => setTab('qa')} />}
        {tab === 'comments' && <Comments taskId={task.id} />}
        {tab === 'qa' && (
          <QATab
            task={task}
            formOpen={qaFormOpen}
            onCloseForm={() => setQaFormOpen(false)}
            onSubmitted={(r) => {
              setQaFormOpen(false);
              toast(r.overallResult === 'PASSED' ? 'QA passed — task moved to Done' : 'QA failed — task reopened for the developer', r.overallResult === 'PASSED' ? 'success' : 'info');
              invalidate(task);
              void qc.invalidateQueries({ queryKey: ['qa-reports', task.id] });
              void qc.invalidateQueries({ queryKey: ['attachments', task.id] });
            }}
          />
        )}
        {tab === 'files' && <Files task={task} canUpload={p.canUpload} />}
        {tab === 'activity' && <TaskActivity taskId={task.id} />}
      </div>

      <TaskFormModal open={editing} onClose={() => setEditing(false)} project={{ id: task.projectId, name: task.project.name, members: members.map((u) => ({ user: u })) }} task={task} />
      <SubmitForQaModal mode={submitMode} task={task} onClose={() => setSubmitMode(null)} onDone={(t) => invalidate(t)} />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archive this task?"
        message="The task will be hidden from boards and lists. Its comments, QA reports and history are kept."
        confirmLabel="Archive task"
        danger
        loading={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
    </>
  );
}

function Overview({ task, onShowQa }: { task: Task; onShowQa: () => void }) {
  const { data: reports } = useQuery({
    queryKey: ['qa-reports', task.id],
    queryFn: async () => (await api.get<{ items: QAReport[] }>(`/tasks/${task.id}/qa-reports`)).data.items,
    enabled: task.qaStatus === 'FAILED',
  });
  const lastFailed = reports?.filter((r) => r.overallResult === 'FAILED').at(-1);
  const rows: [string, React.ReactNode][] = [
    ['Assignee', task.assignee ? <Person u={task.assignee} /> : <span className="text-slate-400">Unassigned</span>],
    ['Reporter', task.reporter ? <Person u={task.reporter} /> : '—'],
    ['Due date', task.dueDate ? <DueLabel due={task.dueDate} done={task.status === 'DONE'} /> : <span className="text-slate-400">No due date</span>],
    ['Start date', fmtDate(task.startDate)],
    ['QA', task.qaRequired ? QA_LABEL[task.qaStatus] : 'Not required'],
  ];
  if (task.qaRequired) {
    rows.push(['QA tester', task.qaAssignee ? <Person u={task.qaAssignee} /> : <span className="text-slate-400">Any project QA</span>]);
    if (task.submittedBy) rows.push(['Submitted for QA', <span key="s">{task.submittedBy.name} · {fmtDateTime(task.submittedAt)}</span>]);
    if (task.qaApprovedBy) rows.push(['QA approved', <span key="a">{task.qaApprovedBy.name} · {fmtDateTime(task.qaApprovedAt)}</span>]);
  }
  rows.push(['Created', fmtDateTime(task.createdAt)], ['Updated', timeAgo(task.updatedAt)]);
  if (task.completedAt) rows.push(['Completed', fmtDateTime(task.completedAt)]);

  return (
    <div className="space-y-5">
      {task.qaStatus === 'FAILED' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <XCircle className="h-4 w-4" /> Returned by QA — needs a fix
          </p>
          {lastFailed ? (
            <>
              <p className="mt-1 text-sm text-red-800">{lastFailed.summary}</p>
              <ul className="mt-2 space-y-1 text-sm text-red-700">
                {lastFailed.testCases
                  .filter((c) => c.result === 'FAILED')
                  .map((c) => (
                    <li key={c.id}>
                      • <span className="font-medium">{c.title}</span>
                      {c.actualResult && <> — actual: {c.actualResult}</>}
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
          <button className="mt-2 text-sm font-medium text-red-800 underline" onClick={onShowQa}>
            View full QA history
          </button>
        </div>
      )}
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
      <div>
        <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Description</h3>
        {task.description ? (
          <div className="markdown text-sm leading-relaxed text-slate-700">
            <ReactMarkdown>{task.description}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No description.</p>
        )}
      </div>
    </div>
  );
}

function Person({ u }: { u: UserMini }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar name={u.name} url={u.avatarUrl} size={20} />
      {u.name}
    </span>
  );
}

function Comments({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: async () => (await api.get<{ items: Comment[] }>(`/tasks/${taskId}/comments`)).data.items,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['comments', taskId] });
    void qc.invalidateQueries({ queryKey: ['task', taskId] });
  };
  const add = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/comments`, { content: text }),
    onSuccess: () => {
      setText('');
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const edit = useMutation({
    mutationFn: (id: string) => api.patch(`/comments/${id}`, { content: editText }),
    onSuccess: () => {
      setEditId(null);
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState message={errorMessage(error)} />;
  return (
    <div className="space-y-4">
      {!data?.length && <EmptyState title="No comments yet" message="Start the conversation. Mention teammates with @firstname." />}
      <ul className="space-y-3">
        {data?.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Avatar name={c.author.name} url={c.author.avatarUrl} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium text-slate-900">{c.author.name}</span>
                <span className="ml-2 text-xs text-slate-500">{timeAgo(c.createdAt)}</span>
                {c.editedAt && !c.deletedAt && <span className="ml-1 text-xs text-slate-400">(edited)</span>}
                {c.kind === 'FIX_NOTE' && <Badge tone="teal" className="ml-2">Fix note</Badge>}
              </p>
              {c.deletedAt ? (
                <p className="mt-0.5 text-sm italic text-slate-400">This comment was deleted.</p>
              ) : editId === c.id ? (
                <div className="mt-1 space-y-2">
                  <Textarea aria-label="Edit comment" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                  <div className="flex gap-2">
                    <Button size="sm" loading={edit.isPending} onClick={() => edit.mutate(c.id)} disabled={!editText.trim()}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="markdown mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-700">{c.content}</div>
              )}
              {!c.deletedAt && editId !== c.id && (c.author.id === user?.id || user?.role === 'ADMIN') && (
                <div className="mt-1 flex gap-3 text-xs">
                  {c.author.id === user?.id && (
                    <button
                      className="text-slate-500 hover:text-slate-800"
                      onClick={() => {
                        setEditId(c.id);
                        setEditText(c.content);
                      }}
                    >
                      Edit
                    </button>
                  )}
                  <button className="text-slate-500 hover:text-red-600" onClick={() => del.mutate(c.id)}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form
        className="space-y-2 border-t border-slate-100 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <Textarea aria-label="Write a comment" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment… (use @firstname to mention)" rows={3} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={add.isPending} disabled={!text.trim()}>
            Comment
          </Button>
        </div>
      </form>
    </div>
  );
}

function QATab({ task, formOpen, onCloseForm, onSubmitted }: { task: Task; formOpen: boolean; onCloseForm: () => void; onSubmitted: (r: QAReport) => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['qa-reports', task.id],
    queryFn: async () => (await api.get<{ items: QAReport[] }>(`/tasks/${task.id}/qa-reports`)).data.items,
  });
  if (!task.qaRequired && !data?.length) {
    return <EmptyState icon={<FlaskConical className="h-5 w-5" />} title="QA is not required for this task" message="A Manager can turn on “QA required” when editing the task." />;
  }
  return (
    <div className="space-y-4">
      {formOpen && <QAReportForm taskId={task.id} taskKey={task.key} onCancel={onCloseForm} onDone={onSubmitted} />}
      {isLoading && <Spinner />}
      {error && <ErrorState message={errorMessage(error)} />}
      {data && data.length === 0 && !formOpen && (
        <EmptyState
          icon={<FlaskConical className="h-5 w-5" />}
          title="No test reports yet"
          message={task.qaStatus === 'PENDING' ? 'The developer has not submitted this task for QA yet.' : 'Reports submitted by QA testers will appear here in order.'}
        />
      )}
      {data && data.length > 0 && (
        <ol className="space-y-3" aria-label="QA report history">
          {data.map((r, i) => (
            <ReportCard key={r.id} report={r} index={i + 1} />
          ))}
        </ol>
      )}
    </div>
  );
}

export function ReportCard({ report: r, index }: { report: QAReport; index?: number }) {
  const passed = r.overallResult === 'PASSED';
  return (
    <li className={clsx('rounded-xl border p-4', passed ? 'border-green-200 bg-green-50/40' : 'border-red-200 bg-red-50/40')}>
      <div className="flex flex-wrap items-center gap-2">
        {passed ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
        <p className="font-medium text-slate-900">
          {index ? `#${index} · ` : ''}
          {r.title}
        </p>
        <Badge tone={passed ? 'green' : 'red'}>{passed ? 'Passed' : 'Failed'}</Badge>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Tested by {r.tester.name} · {fmtDateTime(r.submittedAt)}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.summary}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Case</th>
              <th className="py-1 pr-2 font-medium">Expected</th>
              <th className="py-1 pr-2 font-medium">Actual</th>
              <th className="py-1 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {r.testCases.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="py-1.5 pr-2">
                  <p className="font-medium text-slate-800">{c.title}</p>
                  {c.steps && <p className="whitespace-pre-wrap text-slate-500">{c.steps}</p>}
                </td>
                <td className="py-1.5 pr-2 text-slate-600">{c.expectedResult || '—'}</td>
                <td className="py-1.5 pr-2 text-slate-600">{c.actualResult || '—'}</td>
                <td className="py-1.5">
                  <Badge tone={c.result === 'PASSED' ? 'green' : 'red'}>{c.result === 'PASSED' ? 'Pass' : 'Fail'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.notes && <p className="mt-2 text-xs text-slate-600"><span className="font-medium">Notes:</span> {r.notes}</p>}
      {r.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.attachments.map((a) => (
            <AttachmentChip key={a.id} a={a} />
          ))}
        </div>
      )}
    </li>
  );
}

function AttachmentChip({ a }: { a: Attachment }) {
  const toast = useToast();
  return (
    <button
      onClick={() => downloadAttachment(a.id, a.originalName).catch((e) => toast(errorMessage(e), 'error'))}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
    >
      <FileText className="h-3.5 w-3.5 text-slate-400" />
      {a.originalName}
      <Download className="h-3 w-3 text-slate-400" />
    </button>
  );
}

function Files({ task, canUpload }: { task: Task; canUpload: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ url: string; a: Attachment } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['attachments', task.id],
    queryFn: async () => (await api.get<{ items: Attachment[] }>(`/tasks/${task.id}/attachments`)).data.items,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['attachments', task.id] });
    void qc.invalidateQueries({ queryKey: ['task', task.id] });
    void qc.invalidateQueries({ queryKey: ['tasks', task.projectId] });
  };
  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      setProgress(0);
      await api.post(`/tasks/${task.id}/attachments`, fd, {
        onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)),
      });
    },
    onSuccess: () => {
      setFiles([]);
      setProgress(null);
      setUploadError('');
      toast('Files uploaded');
      refresh();
    },
    onError: (e) => {
      setProgress(null);
      setUploadError(errorMessage(e));
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      toast('File deleted');
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="space-y-2">
          <FilePicker files={files} onChange={setFiles} disabled={upload.isPending} />
          {progress !== null && <ProgressBar value={progress} />}
          {uploadError && (
            <p role="alert" className="text-sm text-red-600">
              {uploadError}
            </p>
          )}
          {files.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" loading={upload.isPending} onClick={() => upload.mutate()}>
                Upload {files.length} file{files.length > 1 ? 's' : ''}
              </Button>
            </div>
          )}
        </div>
      )}
      {isLoading && <Spinner />}
      {error && <ErrorState message={errorMessage(error)} />}
      {data?.length === 0 && <EmptyState title="No attachments" message="Screenshots, logs and documents uploaded to this task appear here." />}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {data?.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
            <FileText className="h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{a.originalName}</p>
              <p className="text-xs text-slate-500">
                {fileSize(a.sizeBytes)} · {a.uploader.name} · {timeAgo(a.createdAt)}
                {a.qaReport && <span className="ml-1">· evidence for “{a.qaReport.title}”</span>}
              </p>
            </div>
            {/^(image\/|application\/pdf|text\/plain)/.test(a.mimeType) && (
              <button
                aria-label={`Preview ${a.originalName}`}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() =>
                  previewAttachment(a.id)
                    .then((url) => setPreview({ url, a }))
                    .catch((e) => toast(errorMessage(e), 'error'))
                }
              >
                <Eye className="h-4 w-4" />
              </button>
            )}
            <button
              aria-label={`Download ${a.originalName}`}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              onClick={() => downloadAttachment(a.id, a.originalName).catch((e) => toast(errorMessage(e), 'error'))}
            >
              <Download className="h-4 w-4" />
            </button>
            {!a.qaReportId && (a.uploader.id === user?.id || user?.role === 'ADMIN' || user?.role === 'MANAGER') && (
              <button aria-label={`Delete ${a.originalName}`} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => del.mutate(a.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={!!preview}
        wide
        onClose={() => {
          if (preview) URL.revokeObjectURL(preview.url);
          setPreview(null);
        }}
        title={preview?.a.originalName ?? ''}
      >
        {preview &&
          (preview.a.mimeType.startsWith('image/') ? (
            <img src={preview.url} alt={preview.a.originalName} className="mx-auto max-h-[70vh] rounded-lg" />
          ) : (
            <iframe title={preview.a.originalName} src={preview.url} className="h-[70vh] w-full rounded-lg border" />
          ))}
      </Modal>
    </div>
  );
}

function TaskActivity({ taskId }: { taskId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: async () => (await api.get<{ items: ActivityEvent[] }>(`/tasks/${taskId}/activity`)).data.items,
  });
  if (isLoading) return <Spinner />;
  return <div className="-mx-4">{data && <ActivityList items={data} showContext={false} />}</div>;
}

function SubmitForQaModal({ mode, task, onClose, onDone }: { mode: null | 'submit' | 'resubmit'; task: Task; onClose: () => void; onDone: (t: Task) => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();
  useEffect(() => {
    setNote('');
    setError('');
  }, [mode]);
  const m = useMutation({
    mutationFn: async () =>
      (await api.post<{ task: Task }>(`/tasks/${task.id}/${mode === 'resubmit' ? 'resubmit-for-qa' : 'submit-for-qa'}`, { note: note.trim() || undefined })).data.task,
    onSuccess: (t) => {
      toast(mode === 'resubmit' ? 'Fix resubmitted for QA' : 'Submitted for QA');
      onDone(t);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={mode === 'resubmit' ? 'Resubmit for QA' : 'Submit for QA'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={m.isPending}
            onClick={() => {
              if (mode === 'resubmit' && note.trim().length < 3) return setError('Describe the fix you made so QA knows what to retest.');
              m.mutate();
            }}
          >
            {mode === 'resubmit' ? 'Resubmit' : 'Submit'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        {mode === 'resubmit'
          ? 'Explain what you changed. QA will be notified to test again.'
          : 'QA testers and the project manager will be notified. The task stays open until QA passes it.'}
      </p>
      <Field label={mode === 'resubmit' ? 'Fix description' : 'Implementation notes (optional)'} htmlFor="qa-note">
        <Textarea id="qa-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should QA know?" />
      </Field>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </Modal>
  );
}
