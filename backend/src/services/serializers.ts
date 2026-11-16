import type { Prisma } from '@prisma/client';

export const userMini = { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } as const;

export const userPublic = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  title: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

export const taskCardInclude = {
  assignee: userMini,
  qaAssignee: userMini,
  labels: { include: { label: true } },
  project: { select: { id: true, name: true, key: true, color: true } },
  _count: {
    select: { comments: { where: { deletedAt: null } }, attachments: true, qaReports: true },
  },
} satisfies Prisma.TaskInclude;

export const taskDetailInclude = {
  ...taskCardInclude,
  reporter: userMini,
  submittedBy: userMini,
  qaApprovedBy: userMini,
} satisfies Prisma.TaskInclude;

type TaskWithLabels = { labels: { label: { id: string; name: string; color: string } }[]; number: number; project: { key: string } };

export function serializeTask<T extends TaskWithLabels>(t: T) {
  return {
    ...t,
    key: `${t.project.key}-${t.number}`,
    labels: t.labels.map((l) => l.label),
  };
}
