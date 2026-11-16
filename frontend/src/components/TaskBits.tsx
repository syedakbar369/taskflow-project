import clsx from 'clsx';
import { AlertTriangle, ArrowDown, ArrowUp, Calendar, ChevronsUp, FlaskConical, MessageSquare, Minus, Paperclip, RotateCcw } from 'lucide-react';
import { dueInfo, PRIORITY_LABEL, QA_LABEL, STATUS_LABEL } from '../lib/format';
import type { Label, Priority, QAStatus, Task, TaskStatus } from '../lib/types';
import { Avatar, Badge } from './ui';

export function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      aria-label={STATUS_LABEL[status]}
      className={clsx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', status === 'TODO' ? 'bg-slate-300' : status === 'IN_PROGRESS' ? 'bg-amber-400' : 'bg-green-500')}
    />
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge tone={status === 'DONE' ? 'green' : status === 'IN_PROGRESS' ? 'amber' : 'slate'}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const PRIORITY_STYLE: Record<Priority, { tone: 'slate' | 'blue' | 'amber' | 'red'; Icon: typeof Minus }> = {
  LOW: { tone: 'slate', Icon: ArrowDown },
  MEDIUM: { tone: 'blue', Icon: Minus },
  HIGH: { tone: 'amber', Icon: ArrowUp },
  URGENT: { tone: 'red', Icon: ChevronsUp },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { tone, Icon } = PRIORITY_STYLE[priority];
  return (
    <Badge tone={tone} title={`Priority: ${PRIORITY_LABEL[priority]}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

export function QABadge({ status }: { status: QAStatus }) {
  if (status === 'NOT_REQUIRED') return null;
  const tone = status === 'PASSED' ? 'green' : status === 'FAILED' ? 'red' : status === 'PENDING' ? 'slate' : 'teal';
  return (
    <Badge tone={tone} title={`QA: ${QA_LABEL[status]}`}>
      <FlaskConical className="h-3 w-3" aria-hidden />
      {QA_LABEL[status]}
    </Badge>
  );
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
      <span className="h-2 w-2 rounded-full" style={{ background: label.color }} />
      {label.name}
    </span>
  );
}

export function DueLabel({ due, done }: { due: string | null; done?: boolean }) {
  const info = dueInfo(due, done);
  if (!info) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-xs',
        info.tone === 'danger' ? 'font-medium text-red-600' : info.tone === 'warn' ? 'font-medium text-amber-700' : 'text-slate-500',
      )}
    >
      {info.tone === 'danger' ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
      {info.label}
    </span>
  );
}

export function TaskCard({ task, onOpen, dragging, compact }: { task: Task; onOpen?: () => void; dragging?: boolean; compact?: boolean }) {
  return (
    <div
      className={clsx(
        'group rounded-lg border bg-white p-3 text-left shadow-card transition-shadow',
        dragging ? 'border-coral-300 shadow-pop' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
        <span>{task.key}</span>
        {task.reopenCount > 0 && task.status !== 'DONE' && (
          <Badge tone="red" className="!px-1 !py-0 text-[10px]" title={`Reopened ${task.reopenCount}×`}>
            <RotateCcw className="h-2.5 w-2.5" /> Reopened
          </Badge>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left text-sm font-medium leading-snug text-slate-800 hover:text-coral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
      >
        {task.title}
      </button>
      {!compact && task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        <QABadge status={task.qaStatus} />
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <DueLabel due={task.dueDate} done={task.status === 'DONE'} />
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          {task._count.comments > 0 && (
            <span className="flex items-center gap-0.5" title={`${task._count.comments} comments`}>
              <MessageSquare className="h-3 w-3" />
              {task._count.comments}
            </span>
          )}
          {task._count.attachments > 0 && (
            <span className="flex items-center gap-0.5" title={`${task._count.attachments} files`}>
              <Paperclip className="h-3 w-3" />
              {task._count.attachments}
            </span>
          )}
          {task.assignee ? (
            <Avatar name={task.assignee.name} url={task.assignee.avatarUrl} size={22} />
          ) : (
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px]" title="Unassigned">
              ?
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/** Compact row used in lists (dashboard, My Tasks, list view). */
export function TaskRow({ task, onOpen, showProject = true }: { task: Task; onOpen: () => void; showProject?: boolean }) {
  return (
    <button onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
      <span className="mt-1.5">
        <StatusDot status={task.status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="whitespace-nowrap">{task.key}</span>
          {showProject && <span className="truncate text-slate-400">{task.project.name}</span>}
          <PriorityBadge priority={task.priority} />
          <QABadge status={task.qaStatus} />
          <DueLabel due={task.dueDate} done={task.status === 'DONE'} />
        </span>
      </span>
      {task.assignee && <Avatar name={task.assignee.name} url={task.assignee.avatarUrl} size={24} />}
    </button>
  );
}
