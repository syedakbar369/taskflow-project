import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { param } from '../lib/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { me } from '../middleware/auth';
import { assertTaskAccess, canManageProject } from '../services/access';
import { logActivity } from '../services/activity';
import { broadcastProject } from '../services/realtime';
import { storage, validateUpload, type ValidFile } from '../services/storage';
import { userMini } from '../services/serializers';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 10 },
});

export const taskAttachmentsRouter = Router({ mergeParams: true });
export const attachmentsRouter = Router();

/** Validate every file first, then store them. Returns stored keys so callers can clean up on failure. */
export async function storeFiles(files: Express.Multer.File[]) {
  const validated: (ValidFile & { file: Express.Multer.File })[] = files.map((file) => ({ ...validateUpload(file), file }));
  const stored: { key: string; v: (typeof validated)[number] }[] = [];
  try {
    for (const v of validated) stored.push({ key: await storage.save(v.file.buffer, v.ext), v });
  } catch (e) {
    await Promise.all(stored.map((s) => storage.remove(s.key)));
    throw e;
  }
  return stored.map((s) => ({ storageKey: s.key, originalName: s.v.originalName, mimeType: s.v.mime, sizeBytes: s.v.file.size }));
}

taskAttachmentsRouter.get('/', async (req, res) => {
  const task = await assertTaskAccess(me(req), param((req.params as Record<string, string>).taskId));
  const items = await prisma.attachment.findMany({
    where: { taskId: task.id },
    include: { uploader: userMini, qaReport: { select: { id: true, title: true, overallResult: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items });
});

taskAttachmentsRouter.post('/', upload.array('files', 10), async (req, res) => {
  const user = me(req);
  const task = await assertTaskAccess(user, param((req.params as Record<string, string>).taskId));
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw badRequest('Choose at least one file to upload');
  const stored = await storeFiles(files);
  try {
    const items = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const s of stored) {
        created.push(
          await tx.attachment.create({ data: { ...s, taskId: task.id, uploaderId: user.id }, include: { uploader: userMini } }),
        );
      }
      await logActivity(tx, {
        actorId: user.id,
        projectId: task.projectId,
        taskId: task.id,
        eventType: 'ATTACHMENT_UPLOADED',
        details: { files: stored.map((s) => s.originalName) },
      });
      return created;
    });
    broadcastProject({ type: 'attachment.created', projectId: task.projectId, taskId: task.id, actorId: user.id });
    res.status(201).json({ items });
  } catch (e) {
    await Promise.all(stored.map((s) => storage.remove(s.storageKey)));
    throw e;
  }
});

attachmentsRouter.get('/:attachmentId/download', async (req, res) => {
  const user = me(req);
  const att = await prisma.attachment.findUnique({ where: { id: param(req.params.attachmentId) } });
  if (!att) throw notFound('File not found');
  await assertTaskAccess(user, att.taskId); // authorization by related project/task
  let stream;
  try {
    stream = await storage.read(att.storageKey);
  } catch {
    throw notFound('The stored file is no longer available');
  }
  const inline = req.query.inline === 'true' && /^(image\/|application\/pdf|text\/plain|video\/mp4)/.test(att.mimeType);
  res.setHeader('Content-Type', att.mimeType);
  res.setHeader('Content-Length', String(att.sizeBytes));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(att.originalName)}`,
  );
  stream.pipe(res);
});

attachmentsRouter.delete('/:attachmentId', async (req, res) => {
  const user = me(req);
  const att = await prisma.attachment.findUnique({ where: { id: param(req.params.attachmentId) } });
  if (!att) throw notFound('File not found');
  const task = await assertTaskAccess(user, att.taskId);
  if (att.qaReportId) throw forbidden('Evidence attached to a submitted QA report cannot be deleted');
  if (att.uploaderId !== user.id && !(await canManageProject(user, task.projectId))) {
    throw forbidden('Only the uploader or a project Manager can delete this file');
  }
  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: att.id } });
    await logActivity(tx, {
      actorId: user.id,
      projectId: task.projectId,
      taskId: task.id,
      eventType: 'ATTACHMENT_DELETED',
      details: { file: att.originalName },
    });
  });
  await storage.remove(att.storageKey);
  broadcastProject({ type: 'attachment.deleted', projectId: task.projectId, taskId: task.id, actorId: user.id });
  res.json({ ok: true });
});
