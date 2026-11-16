import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { teamRouter } from './routes/team';
import { labelsRouter } from './routes/labels';
import { projectsRouter } from './routes/projects';
import { projectTasksRouter, tasksRouter } from './routes/tasks';
import { commentsRouter, taskCommentsRouter } from './routes/comments';
import { attachmentsRouter, taskAttachmentsRouter } from './routes/attachments';
import { qaReportsRouter, qaRouter, taskQaReportsRouter } from './routes/qa';
import { notificationsRouter } from './routes/notifications';
import { reportsRouter } from './routes/reports';
import { dashboardRouter } from './routes/dashboard';
import { activityRouter, searchRouter } from './routes/misc';

export function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
  // Non-browser clients (curl, health checks) send no Origin header.
  if (!origin) return cb(null, true);
  const clean = origin.replace(/\/$/, '');
  const ok = env.corsOrigins.some((allowed) => {
    if (allowed === clean) return true;
    // Support wildcard entries such as https://*.vercel.app for preview deployments.
    if (allowed.includes('*')) {
      const re = new RegExp('^' + allowed.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('[a-z0-9-]+') + '$');
      return re.test(clean);
    }
    return false;
  });
  cb(null, ok);
}

export function createApp() {
  const app = express();
  if (env.isProd || env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  // Request logging: method, path (no query string — may contain search terms), status and timing. Never bodies/tokens.
  morgan.token('path', (req) => (req.url ?? '').split('?')[0]);
  if (!env.isTest) app.use(morgan(':method :path :status :response-time ms', { skip: (req) => req.url === '/api/health' }));

  app.use(
    '/api',
    rateLimit({ windowMs: 60 * 1000, limit: env.isTest ? 10000 : 600, standardHeaders: 'draft-7', legacyHeaders: false }),
  );

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });
  app.get('/', (_req, res) => {
    res.json({ name: 'TaskFlow API', health: '/api/health' });
  });

  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(requireAuth);
  api.use('/users', usersRouter);
  api.use('/team', teamRouter);
  api.use('/labels', labelsRouter);
  api.use('/projects/:projectId/tasks', projectTasksRouter);
  api.use('/projects', projectsRouter);
  api.use('/tasks/:taskId/comments', taskCommentsRouter);
  api.use('/tasks/:taskId/attachments', taskAttachmentsRouter);
  api.use('/tasks/:taskId/qa-reports', taskQaReportsRouter);
  api.use('/tasks', tasksRouter);
  api.use('/comments', commentsRouter);
  api.use('/attachments', attachmentsRouter);
  api.use('/qa', qaRouter);
  api.use('/qa-reports', qaReportsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/reports', reportsRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/search', searchRouter);
  api.use('/activity', activityRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
