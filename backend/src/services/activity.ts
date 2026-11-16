import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type Tx = Prisma.TransactionClient | typeof prisma;

export const EventTypes = [
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_ARCHIVED',
  'PROJECT_RESTORED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_ARCHIVED',
  'ASSIGNEE_CHANGED',
  'QA_ASSIGNEE_CHANGED',
  'PRIORITY_CHANGED',
  'DUE_DATE_CHANGED',
  'STATUS_CHANGED',
  'LABELS_CHANGED',
  'SUBMITTED_FOR_QA',
  'RESUBMITTED_FOR_QA',
  'QA_TESTING_STARTED',
  'QA_REPORT_SUBMITTED',
  'QA_PASSED',
  'QA_FAILED',
  'TASK_REOPENED',
  'COMMENT_ADDED',
  'COMMENT_EDITED',
  'COMMENT_DELETED',
  'ATTACHMENT_UPLOADED',
  'ATTACHMENT_DELETED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ROLE_CHANGED',
  'USER_STATUS_CHANGED',
] as const;
export type EventType = (typeof EventTypes)[number];

export async function logActivity(
  tx: Tx,
  e: {
    actorId: string | null;
    eventType: EventType;
    projectId?: string | null;
    taskId?: string | null;
    details?: Prisma.InputJsonValue;
  },
) {
  await tx.activityEvent.create({
    data: {
      actorId: e.actorId,
      eventType: e.eventType,
      projectId: e.projectId ?? null,
      taskId: e.taskId ?? null,
      details: e.details,
    },
  });
}
