/**
 * Development seed. Creates demo users, projects, tasks, QA reports, comments, labels, activity and notifications.
 * WARNING: wipes existing data. Refuses to run in production unless SEED_FORCE=true.
 * Passwords come from SEED_PASSWORD; if unset a random one is generated and printed once.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { LocalDiskStorage } from '../src/services/storage';

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
    throw new Error('Refusing to seed demo data in production. Use `npm run create-admin` instead (or set SEED_FORCE=true).');
  }
  const password = process.env.SEED_PASSWORD || `Demo-${crypto.randomBytes(5).toString('hex')}1`;
  const passwordHash = await bcrypt.hash(password, 10);

  console.log('Clearing existing data...');
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.activityEvent.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.qATestCase.deleteMany(),
    prisma.qAReport.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.taskLabel.deleteMany(),
    prisma.task.deleteMany(),
    prisma.label.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.project.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const mk = (name: string, email: string, role: 'ADMIN' | 'MANAGER' | 'QA' | 'DEVELOPER', title: string) =>
    prisma.user.create({ data: { name, email, role, title, passwordHash } });
  const admin = await mk('Ayesha Khan', 'admin@taskflow.dev', 'ADMIN', 'Workspace Admin');
  const manager = await mk('Marcus Reid', 'manager@taskflow.dev', 'MANAGER', 'Project Manager');
  const qa1 = await mk('Priya Nair', 'qa1@taskflow.dev', 'QA', 'QA Engineer');
  const qa2 = await mk('Tom Becker', 'qa2@taskflow.dev', 'QA', 'QA Analyst');
  const dev1 = await mk('Leo Martins', 'dev1@taskflow.dev', 'DEVELOPER', 'Frontend Developer');
  const dev2 = await mk('Sara Ahmed', 'dev2@taskflow.dev', 'DEVELOPER', 'Backend Developer');

  const labelDefs: [string, string][] = [
    ['Bug', '#DC2626'],
    ['Feature', '#16A34A'],
    ['Task', '#64748B'],
    ['UI', '#DB7706'],
    ['Backend', '#0E7490'],
    ['Urgent', '#BE123C'],
  ];
  const labels: Record<string, string> = {};
  for (const [name, color] of labelDefs) labels[name] = (await prisma.label.create({ data: { name, color } })).id;

  const web = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      key: 'WEB',
      description: 'Refresh the marketing website with a new design system, faster pages and an accessible checkout.',
      color: '#F06A4A',
      ownerId: manager.id,
      startDate: daysFromNow(-20),
      dueDate: daysFromNow(25),
      members: {
        create: [admin, manager, qa1, qa2, dev1, dev2].map((u) => ({ userId: u.id, projectRole: u.id === manager.id ? 'Owner' : null })),
      },
    },
  });
  const mobile = await prisma.project.create({
    data: {
      name: 'Mobile App Launch',
      key: 'MOB',
      description: 'Ship v1 of the companion mobile app with login, notifications and offline task lists.',
      color: '#16A34A',
      ownerId: manager.id,
      startDate: daysFromNow(-10),
      dueDate: daysFromNow(40),
      members: { create: [manager, qa1, dev2].map((u) => ({ userId: u.id, projectRole: u.id === manager.id ? 'Owner' : null })) },
    },
  });
  await prisma.project.create({
    data: {
      name: 'Internal Tools',
      key: 'OPS',
      description: 'Small automation and admin tooling for the operations team.',
      color: '#0E7490',
      status: 'ON_HOLD',
      ownerId: admin.id,
      members: { create: [{ userId: admin.id, projectRole: 'Owner' }, { userId: dev1.id }] },
    },
  });

  const activity: Prisma.ActivityEventCreateManyInput[] = [];
  const counters: Record<string, number> = { [web.id]: 0, [mobile.id]: 0 };
  const positions: Record<string, number> = {};
  async function task(
    project: { id: string; key: string },
    data: Omit<Prisma.TaskUncheckedCreateInput, 'projectId' | 'number' | 'reporterId'> & { labelNames?: string[]; createdDaysAgo?: number },
  ) {
    const { labelNames = [], createdDaysAgo = 7, ...rest } = data;
    const number = ++counters[project.id]!;
    const posKey = `${project.id}:${rest.status ?? 'TODO'}`;
    positions[posKey] = (positions[posKey] ?? 0) + 1000;
    const createdAt = daysFromNow(-createdDaysAgo);
    const t = await prisma.task.create({
      data: {
        ...rest,
        projectId: project.id,
        number,
        reporterId: manager.id,
        position: positions[posKey]!,
        createdAt,
        labels: { create: labelNames.map((n) => ({ labelId: labels[n]! })) },
      },
    });
    activity.push({
      actorId: manager.id,
      projectId: project.id,
      taskId: t.id,
      eventType: 'TASK_CREATED',
      details: { title: t.title, key: `${project.key}-${number}` },
      createdAt,
    });
    return t;
  }

  // --- Website Redesign -------------------------------------------------------
  const t1 = await task(web, {
    title: 'Set up design tokens for colors and spacing',
    description: 'Create a single source of truth for colors, typography and spacing used across the site.',
    status: 'DONE',
    priority: 'MEDIUM',
    assigneeId: dev1.id,
    completedAt: daysFromNow(-3),
    labelNames: ['UI', 'Task'],
    createdDaysAgo: 18,
  });
  const t2 = await task(web, {
    title: 'Build responsive navigation header',
    description: '- Collapsible menu on mobile\n- Keyboard accessible\n- Highlights current page',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assigneeId: dev1.id,
    qaAssigneeId: qa1.id,
    dueDate: daysFromNow(2),
    qaRequired: true,
    qaStatus: 'AWAITING_QA',
    submittedById: dev1.id,
    submittedAt: daysFromNow(-1),
    labelNames: ['UI', 'Feature'],
    createdDaysAgo: 9,
  });
  const t3 = await task(web, {
    title: 'Checkout form loses data on validation error',
    description: 'When the card number is invalid the whole form resets. Inputs must keep their values.',
    status: 'IN_PROGRESS',
    priority: 'URGENT',
    assigneeId: dev2.id,
    qaAssigneeId: qa2.id,
    dueDate: daysFromNow(-1),
    qaRequired: true,
    qaStatus: 'FAILED',
    submittedById: dev2.id,
    submittedAt: daysFromNow(-3),
    reopenedAt: daysFromNow(-2),
    reopenCount: 1,
    labelNames: ['Bug', 'Urgent', 'Backend'],
    createdDaysAgo: 8,
  });
  const t4 = await task(web, {
    title: 'Optimize hero images for faster load',
    description: 'Serve WebP with fallbacks and lazy-load below-the-fold images.',
    status: 'DONE',
    priority: 'MEDIUM',
    assigneeId: dev2.id,
    qaAssigneeId: qa1.id,
    qaRequired: true,
    qaStatus: 'PASSED',
    submittedById: dev2.id,
    submittedAt: daysFromNow(-5),
    qaApprovedById: qa1.id,
    qaApprovedAt: daysFromNow(-4),
    completedAt: daysFromNow(-4),
    labelNames: ['Feature'],
    createdDaysAgo: 14,
  });
  await task(web, {
    title: 'Write copy for the pricing page',
    status: 'TODO',
    priority: 'LOW',
    assigneeId: dev1.id,
    dueDate: daysFromNow(6),
    labelNames: ['Task'],
    createdDaysAgo: 4,
  });
  await task(web, {
    title: 'Add newsletter signup to footer',
    description: 'Simple email field with success and error states.',
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: dev2.id,
    qaRequired: true,
    qaStatus: 'PENDING',
    dueDate: daysFromNow(9),
    labelNames: ['Feature', 'UI'],
    createdDaysAgo: 3,
  });
  await task(web, {
    title: 'Audit color contrast on all pages',
    status: 'TODO',
    priority: 'HIGH',
    dueDate: daysFromNow(4),
    labelNames: ['UI'],
    createdDaysAgo: 2,
  });

  // --- Mobile App Launch -------------------------------------------------------
  await task(mobile, {
    title: 'Implement login screen',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assigneeId: dev2.id,
    qaRequired: true,
    qaStatus: 'PENDING',
    dueDate: daysFromNow(5),
    labelNames: ['Feature'],
    createdDaysAgo: 6,
  });
  await task(mobile, {
    title: 'Push notification permissions flow',
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: dev2.id,
    dueDate: daysFromNow(12),
    labelNames: ['Feature'],
    createdDaysAgo: 5,
  });
  await task(mobile, {
    title: 'Set up crash reporting',
    status: 'DONE',
    priority: 'LOW',
    assigneeId: dev2.id,
    completedAt: daysFromNow(-1),
    labelNames: ['Backend', 'Task'],
    createdDaysAgo: 9,
  });

  // --- QA reports (immutable history) ------------------------------------------
  const failed = await prisma.qAReport.create({
    data: {
      taskId: t3.id,
      testerId: qa2.id,
      title: 'Checkout validation retest #1',
      summary: 'Form still clears the address fields after an invalid card number is submitted.',
      overallResult: 'FAILED',
      notes: 'Reproduced on Chrome 131 and Firefox 133.',
      submittedAt: daysFromNow(-2),
      testCases: {
        create: [
          {
            title: 'Card number keeps value after error',
            steps: '1. Enter invalid card\n2. Submit',
            expectedResult: 'Card field keeps value and shows error',
            actualResult: 'Card field keeps value',
            result: 'PASSED',
            order: 0,
          },
          {
            title: 'Address fields keep values after error',
            steps: '1. Fill address\n2. Enter invalid card\n3. Submit',
            expectedResult: 'Address fields unchanged',
            actualResult: 'All address fields are cleared',
            result: 'FAILED',
            order: 1,
          },
        ],
      },
    },
  });
  await prisma.qAReport.create({
    data: {
      taskId: t4.id,
      testerId: qa1.id,
      title: 'Image optimization verification',
      summary: 'All hero images served as WebP; Lighthouse performance improved from 71 to 93.',
      overallResult: 'PASSED',
      submittedAt: daysFromNow(-4),
      testCases: {
        create: [
          { title: 'WebP served on supported browsers', expectedResult: 'image/webp', actualResult: 'image/webp', result: 'PASSED', order: 0 },
          { title: 'Fallback JPEG on Safari 13', expectedResult: 'image/jpeg', actualResult: 'image/jpeg', result: 'PASSED', order: 1 },
        ],
      },
    },
  });

  // Safe sample evidence file (plain text log) stored via the storage abstraction.
  const storage = new LocalDiskStorage(process.env.UPLOAD_DIR || './uploads');
  const logText = Buffer.from(
    '[2024-05-01 10:22:13] POST /checkout 422 card_number invalid\n[2024-05-01 10:22:13] form state reset: address fields cleared\n',
  );
  const key = await storage.save(logText, 'log');
  await prisma.attachment.create({
    data: {
      taskId: t3.id,
      qaReportId: failed.id,
      uploaderId: qa2.id,
      originalName: 'checkout-console.log',
      storageKey: key,
      mimeType: 'text/plain',
      sizeBytes: logText.length,
      createdAt: daysFromNow(-2),
    },
  });

  // --- Comments --------------------------------------------------------------
  await prisma.comment.createMany({
    data: [
      { taskId: t2.id, authorId: dev1.id, content: 'Menu now collapses below 768px and supports Esc to close.', kind: 'FIX_NOTE', createdAt: daysFromNow(-1) },
      { taskId: t2.id, authorId: manager.id, content: '@Priya can you test this before Friday?', createdAt: daysFromNow(-1) },
      { taskId: t3.id, authorId: qa2.id, content: 'See failed test case #2 and the attached console log.', createdAt: daysFromNow(-2) },
      { taskId: t3.id, authorId: dev2.id, content: 'Looking into it — the address component remounts on error.', createdAt: daysFromNow(-1) },
      { taskId: t1.id, authorId: admin.id, content: 'Nice work, tokens are already used in the new header.', createdAt: daysFromNow(-3) },
    ],
  });

  // --- Activity history --------------------------------------------------------
  activity.push(
    { actorId: manager.id, projectId: web.id, eventType: 'PROJECT_CREATED', details: { name: web.name }, createdAt: daysFromNow(-20) },
    { actorId: manager.id, projectId: mobile.id, eventType: 'PROJECT_CREATED', details: { name: mobile.name }, createdAt: daysFromNow(-10) },
    { actorId: dev1.id, projectId: web.id, taskId: t1.id, eventType: 'STATUS_CHANGED', details: { from: 'IN_PROGRESS', to: 'DONE' }, createdAt: daysFromNow(-3) },
    { actorId: dev1.id, projectId: web.id, taskId: t2.id, eventType: 'SUBMITTED_FOR_QA', createdAt: daysFromNow(-1) },
    { actorId: dev2.id, projectId: web.id, taskId: t3.id, eventType: 'SUBMITTED_FOR_QA', createdAt: daysFromNow(-3) },
    { actorId: qa2.id, projectId: web.id, taskId: t3.id, eventType: 'QA_REPORT_SUBMITTED', details: { result: 'FAILED' }, createdAt: daysFromNow(-2) },
    { actorId: qa2.id, projectId: web.id, taskId: t3.id, eventType: 'QA_FAILED', createdAt: daysFromNow(-2) },
    { actorId: qa2.id, projectId: web.id, taskId: t3.id, eventType: 'TASK_REOPENED', details: { reason: 'QA failed' }, createdAt: daysFromNow(-2) },
    { actorId: dev2.id, projectId: web.id, taskId: t4.id, eventType: 'SUBMITTED_FOR_QA', createdAt: daysFromNow(-5) },
    { actorId: qa1.id, projectId: web.id, taskId: t4.id, eventType: 'QA_REPORT_SUBMITTED', details: { result: 'PASSED' }, createdAt: daysFromNow(-4) },
    { actorId: qa1.id, projectId: web.id, taskId: t4.id, eventType: 'QA_PASSED', createdAt: daysFromNow(-4) },
    { actorId: qa2.id, projectId: web.id, taskId: t3.id, eventType: 'ATTACHMENT_UPLOADED', details: { files: ['checkout-console.log'] }, createdAt: daysFromNow(-2) },
  );
  await prisma.activityEvent.createMany({ data: activity });
  await prisma.project.update({ where: { id: web.id }, data: { taskCounter: counters[web.id] } });
  await prisma.project.update({ where: { id: mobile.id }, data: { taskCounter: counters[mobile.id] } });

  // --- Notifications ----------------------------------------------------------
  await prisma.notification.createMany({
    data: [
      { recipientId: qa1.id, actorId: dev1.id, type: 'TASK_SUBMITTED_FOR_QA', title: 'Ready for QA', message: 'Leo Martins submitted WEB-2: Build responsive navigation header for QA', relatedProjectId: web.id, relatedTaskId: t2.id },
      { recipientId: dev2.id, actorId: qa2.id, type: 'QA_FAILED', title: 'QA failed — task reopened', message: 'Tom Becker failed WEB-3: Checkout form loses data on validation error', relatedProjectId: web.id, relatedTaskId: t3.id },
      { recipientId: manager.id, actorId: qa2.id, type: 'QA_FAILED', title: 'QA failed — task reopened', message: 'Tom Becker failed WEB-3: Checkout form loses data on validation error', relatedProjectId: web.id, relatedTaskId: t3.id },
      { recipientId: dev2.id, actorId: qa1.id, type: 'QA_PASSED', title: 'QA passed', message: 'Priya Nair approved WEB-4: Optimize hero images for faster load', relatedProjectId: web.id, relatedTaskId: t4.id, readAt: daysFromNow(-3) },
      { recipientId: dev1.id, actorId: manager.id, type: 'TASK_ASSIGNED', title: 'New task assigned', message: 'Marcus Reid assigned you WEB-5: Write copy for the pricing page', relatedProjectId: web.id },
    ],
  });

  console.log('\nSeed complete. Demo accounts (development only):');
  console.table(
    [admin, manager, qa1, qa2, dev1, dev2].map((u) => ({ role: u.role, name: u.name, email: u.email })),
  );
  console.log(`Password for all demo accounts: ${password}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
