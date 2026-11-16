import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../lib/errors';
import type { AuthUser } from '../middleware/auth';

/** Prisma filter selecting the projects a user may see. Admin sees everything. */
export function projectScope(user: Pick<AuthUser, 'id' | 'role'>): Prisma.ProjectWhereInput {
  return user.role === 'ADMIN' ? {} : { members: { some: { userId: user.id } } };
}

/** Prisma filter selecting tasks the user may see (non-archived tasks of accessible projects). */
export function taskScope(user: Pick<AuthUser, 'id' | 'role'>): Prisma.TaskWhereInput {
  return user.role === 'ADMIN' ? {} : { project: { members: { some: { userId: user.id } } } };
}

export async function isProjectMember(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return !!m;
}

export async function assertProjectAccess(user: AuthUser, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Project not found');
  if (user.role !== 'ADMIN' && !(await isProjectMember(projectId, user.id))) {
    throw forbidden('You do not have access to this project');
  }
  return project;
}

/** Admins manage every project; Managers manage projects they belong to. */
export async function canManageProject(user: AuthUser, projectId: string) {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'MANAGER') return false;
  return isProjectMember(projectId, user.id);
}

export async function assertCanManageProject(user: AuthUser, projectId: string) {
  const project = await assertProjectAccess(user, projectId);
  if (!(await canManageProject(user, projectId))) {
    throw forbidden('Only Admins and project Managers can do that');
  }
  return project;
}

export async function assertTaskAccess(user: AuthUser, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { id: true, key: true, name: true, ownerId: true, archivedAt: true } } },
  });
  if (!task) throw notFound('Task not found');
  if (user.role !== 'ADMIN' && !(await isProjectMember(task.projectId, user.id))) {
    throw forbidden('You do not have access to this task');
  }
  return task;
}

/** Ensure a user can be assigned within a project (must be an active project member, optionally of given roles). */
export async function assertAssignable(projectId: string, userId: string, roles?: Role[], label = 'Assignee') {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { user: { select: { isActive: true, role: true, name: true } } },
  });
  if (!m) throw forbidden(`${label} must be a member of this project`);
  if (!m.user.isActive) throw forbidden(`${label} is deactivated`);
  if (roles && !roles.includes(m.user.role)) {
    throw forbidden(`${label} must have one of these roles: ${roles.join(', ')}`);
  }
  return m.user;
}

/** Users who should hear about project-level events: project owner + Manager/Admin members. */
export async function projectManagerIds(projectId: string): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, members: { select: { user: { select: { id: true, role: true, isActive: true } } } } },
  });
  if (!project) return [];
  const ids = new Set<string>([project.ownerId]);
  for (const m of project.members) {
    if (m.user.isActive && (m.user.role === 'MANAGER' || m.user.role === 'ADMIN')) ids.add(m.user.id);
  }
  return [...ids];
}

export async function projectQaIds(projectId: string): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, user: { role: 'QA', isActive: true } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
