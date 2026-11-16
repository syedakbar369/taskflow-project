import { format, formatDistanceToNowStrict, isPast, isToday, isTomorrow, differenceInCalendarDays } from 'date-fns';
import type { Priority, ProjectStatus, QAStatus, Role, TaskStatus } from './types';

export const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done' };
export const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

export const PRIORITY_LABEL: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };
export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const QA_LABEL: Record<QAStatus, string> = {
  NOT_REQUIRED: 'Not required',
  PENDING: 'Not submitted',
  AWAITING_QA: 'Awaiting QA',
  IN_TESTING: 'In testing',
  PASSED: 'QA passed',
  FAILED: 'QA failed',
};

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', MANAGER: 'Manager', QA: 'QA', DEVELOPER: 'Developer' };
export const ROLES: Role[] = ['ADMIN', 'MANAGER', 'QA', 'DEVELOPER'];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export function fmtDate(d: string | Date | null | undefined, pattern = 'MMM d, yyyy') {
  if (!d) return '—';
  return format(new Date(d), pattern);
}

export function fmtDateTime(d: string | Date | null | undefined) {
  return fmtDate(d, 'MMM d, yyyy · h:mm a');
}

export function timeAgo(d: string | Date) {
  return `${formatDistanceToNowStrict(new Date(d))} ago`;
}

/** Friendly due-date label + tone for task cards. */
export function dueInfo(due: string | null, done = false): { label: string; tone: 'muted' | 'warn' | 'danger' | 'ok' } | null {
  if (!due) return null;
  const d = new Date(due);
  if (done) return { label: format(d, 'MMM d'), tone: 'muted' };
  if (isToday(d)) return { label: 'Today', tone: 'warn' };
  if (isTomorrow(d)) return { label: 'Tomorrow', tone: 'warn' };
  if (isPast(d)) return { label: `Overdue · ${format(d, 'MMM d')}`, tone: 'danger' };
  const days = differenceInCalendarDays(d, new Date());
  return { label: days <= 7 ? format(d, 'EEE, MMM d') : format(d, 'MMM d'), tone: 'ok' };
}

export function toDateInput(d: string | null | undefined) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const AVATAR_COLORS = ['#F06A4A', '#16A34A', '#0E7490', '#DB7706', '#7C3AED', '#BE123C', '#0369A1', '#4D7C0F'];
export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

const EVENT_TEXT: Record<string, string> = {
  PROJECT_CREATED: 'created the project',
  PROJECT_UPDATED: 'updated project details',
  PROJECT_ARCHIVED: 'archived the project',
  PROJECT_RESTORED: 'restored the project',
  MEMBER_ADDED: 'added a member',
  MEMBER_REMOVED: 'removed a member',
  TASK_CREATED: 'created',
  TASK_UPDATED: 'updated',
  TASK_ARCHIVED: 'archived',
  ASSIGNEE_CHANGED: 'changed the assignee of',
  QA_ASSIGNEE_CHANGED: 'changed the QA tester of',
  PRIORITY_CHANGED: 'changed the priority of',
  DUE_DATE_CHANGED: 'changed the due date of',
  STATUS_CHANGED: 'moved',
  LABELS_CHANGED: 'changed labels on',
  SUBMITTED_FOR_QA: 'submitted for QA',
  RESUBMITTED_FOR_QA: 'resubmitted a fix for',
  QA_TESTING_STARTED: 'started testing',
  QA_REPORT_SUBMITTED: 'submitted a test report for',
  QA_PASSED: 'passed QA on',
  QA_FAILED: 'failed QA on',
  TASK_REOPENED: 'reopened',
  COMMENT_ADDED: 'commented on',
  COMMENT_EDITED: 'edited a comment on',
  COMMENT_DELETED: 'deleted a comment on',
  ATTACHMENT_UPLOADED: 'uploaded files to',
  ATTACHMENT_DELETED: 'deleted a file from',
  USER_CREATED: 'created a user account',
  USER_UPDATED: 'updated a user',
  USER_ROLE_CHANGED: 'changed a user role',
  USER_STATUS_CHANGED: 'changed a user status',
};

export function describeEvent(type: string, details: Record<string, unknown> | null): string {
  const base = EVENT_TEXT[type] ?? type.toLowerCase().replace(/_/g, ' ');
  if (type === 'STATUS_CHANGED' && details?.to) {
    return `${base}`;
  }
  return base;
}

export function eventSuffix(type: string, details: Record<string, unknown> | null): string {
  if (!details) return '';
  if (type === 'STATUS_CHANGED' && typeof details.from === 'string' && typeof details.to === 'string') {
    return `${STATUS_LABEL[details.from as TaskStatus] ?? details.from} → ${STATUS_LABEL[details.to as TaskStatus] ?? details.to}`;
  }
  if (type === 'PRIORITY_CHANGED' && typeof details.to === 'string') {
    return `${PRIORITY_LABEL[details.from as Priority] ?? details.from} → ${PRIORITY_LABEL[details.to as Priority] ?? details.to}`;
  }
  if (type === 'DUE_DATE_CHANGED') {
    return `${details.from ? fmtDate(details.from as string, 'MMM d') : 'none'} → ${details.to ? fmtDate(details.to as string, 'MMM d') : 'none'}`;
  }
  if ((type === 'MEMBER_ADDED' || type === 'MEMBER_REMOVED') && typeof details.name === 'string') return details.name;
  if (type === 'ATTACHMENT_UPLOADED' && Array.isArray(details.files)) return (details.files as string[]).join(', ');
  if (type === 'TASK_REOPENED' && typeof details.reason === 'string') return details.reason;
  if (type === 'USER_ROLE_CHANGED' && typeof details.to === 'string') return `${ROLE_LABEL[details.from as Role]} → ${ROLE_LABEL[details.to as Role]}`;
  return '';
}
