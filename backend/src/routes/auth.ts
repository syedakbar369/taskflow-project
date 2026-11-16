import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AUTH_COOKIE, signToken } from '../lib/jwt';
import { emailSchema, parse, passwordSchema } from '../lib/validate';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors';
import { me, requireAuth } from '../middleware/auth';
import { userPublic } from '../services/serializers';
import { logActivity } from '../services/activity';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

// Pre-computed hash so failed lookups take similar time to real comparisons.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 10);

function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, secure: env.cookieSecure, sameSite: env.cookieSecure ? 'none' : 'lax', path: '/' });
}

authRouter.get('/config', async (_req, res) => {
  const userCount = await prisma.user.count();
  res.json({ allowSignup: env.ALLOW_SIGNUP || userCount === 0, hasUsers: userCount > 0 });
});

authRouter.post('/signup', authLimiter, async (req, res) => {
  const body = parse(
    z.object({ name: z.string().trim().min(2, 'Name is too short').max(80), email: emailSchema, password: passwordSchema }),
    req.body,
  );
  const userCount = await prisma.user.count();
  if (!env.ALLOW_SIGNUP && userCount > 0) {
    throw forbidden('Public sign-up is disabled. Ask an Admin to create your account.');
  }
  if (await prisma.user.findUnique({ where: { email: body.email } })) {
    throw conflict('An account with this email already exists');
  }
  // Bootstrap: the very first account becomes Admin. Everyone else starts with least privilege (Developer).
  const role = userCount === 0 ? 'ADMIN' : 'DEVELOPER';
  const user = await prisma.user.create({
    data: { name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12), role, lastLoginAt: new Date() },
    select: { ...userPublic, tokenVersion: true },
  });
  await logActivity(prisma, { actorId: user.id, eventType: 'USER_CREATED', details: { via: 'signup', role } });
  const token = signToken(user.id, user.tokenVersion);
  setAuthCookie(res, token);
  const { tokenVersion: _v, ...publicUser } = user;
  res.status(201).json({ user: publicUser, token });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(z.object({ email: emailSchema, password: z.string().min(1, 'Password is required').max(200) }), req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Incorrect email or password');
  if (!user.isActive) throw forbidden('This account has been deactivated. Contact an Admin.');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = signToken(user.id, user.tokenVersion);
  setAuthCookie(res, token);
  const publicUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: userPublic });
  res.json({ user: publicUser, token });
});

/** Logout revokes every token for this user (tokenVersion bump) and clears the cookie. */
authRouter.post('/logout', requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: me(req).id }, data: { tokenVersion: { increment: 1 } } });
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me(req).id }, select: userPublic });
  res.json({ user });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      title: z.string().trim().max(80).nullable().optional(),
      avatarUrl: z.string().trim().url().max(500).nullable().optional(),
    }),
    req.body,
  );
  const user = await prisma.user.update({ where: { id: me(req).id }, data: body, select: userPublic });
  res.json({ user });
});

authRouter.post('/change-password', requireAuth, authLimiter, async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me(req).id } });
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, 12), tokenVersion: { increment: 1 } },
  });
  const token = signToken(updated.id, updated.tokenVersion);
  setAuthCookie(res, token);
  res.json({ ok: true, token });
});
