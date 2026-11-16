export type Role = 'ADMIN' | 'MANAGER' | 'QA' | 'DEVELOPER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type QAStatus = 'NOT_REQUIRED' | 'PENDING' | 'AWAITING_QA' | 'IN_TESTING' | 'PASSED' | 'FAILED';
export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
export type TestResult = 'PASSED' | 'FAILED';

export interface UserMini {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
}

export interface User extends UserMini {
  isActive: boolean;
  title: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface ProjectStats {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  progress: number;
}

export interface ProjectMember {
  id: string;
  userId: string;
  projectRole: string | null;
  user: UserMini & { isActive?: boolean; title?: string | null };
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  ownerId: string;
  owner: UserMini;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  members: ProjectMember[];
  stats: ProjectStats;
  _count?: { members: number };
  canManage?: boolean;
  qaStats?: Partial<Record<QAStatus, number>>;
}

export interface Task {
  id: string;
  key: string;
  number: number;
  projectId: string;
  project: { id: string; name: string; key: string; color: string };
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  position: number;
  assigneeId: string | null;
  assignee: UserMini | null;
  qaAssigneeId: string | null;
  qaAssignee: UserMini | null;
  reporter?: UserMini;
  submittedBy?: UserMini | null;
  qaApprovedBy?: UserMini | null;
  startDate: string | null;
  dueDate: string | null;
  qaRequired: boolean;
  qaStatus: QAStatus;
  submittedAt: string | null;
  qaApprovedAt: string | null;
  reopenedAt: string | null;
  reopenCount: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  _count: { comments: number; attachments: number; qaReports: number };
}

export interface TaskPermissions {
  canEdit: boolean;
  canAssign: boolean;
  canArchive: boolean;
  canMove: boolean;
  canComplete: boolean;
  canSubmitForQa: boolean;
  canResubmitForQa: boolean;
  canStartTesting: boolean;
  canSubmitQaReport: boolean;
  canComment: boolean;
  canUpload: boolean;
}

export interface Comment {
  id: string;
  taskId: string;
  content: string;
  kind: 'COMMENT' | 'FIX_NOTE' | 'QA_NOTE';
  author: UserMini;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface Attachment {
  id: string;
  taskId: string;
  qaReportId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploader: UserMini;
  qaReport?: { id: string; title: string; overallResult: TestResult } | null;
}

export interface QATestCase {
  id: string;
  title: string;
  steps: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  result: TestResult;
}

export interface QAReport {
  id: string;
  taskId: string;
  title: string;
  summary: string;
  overallResult: TestResult;
  notes: string | null;
  submittedAt: string;
  tester: UserMini;
  testCases: QATestCase[];
  attachments: Attachment[];
  task: { id: string; title: string; number: number; project: { id: string; key: string; name: string } };
}

export interface ActivityEvent {
  id: string;
  eventType: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  actor: UserMini | null;
  task?: { id: string; title: string; number: number } | null;
  project?: { id: string; name: string; key: string } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedProjectId: string | null;
  relatedTaskId: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
