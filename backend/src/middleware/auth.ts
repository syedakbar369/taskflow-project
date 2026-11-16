import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AUTH_COOKIE, verifyToken } from '../lib/jwt';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  avatarUrl: string | null;
  title: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function extractToken(authHeader?: string, cookieToken?: string): string | undefined {
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return cookieToken || undefined;
}

/** Resolve a token to an active user, enforcing tokenVersion (deactivation/password change revokes tokens). */
export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      title: true,
      tokenVersion: true,
    },
  });
  if (!user || !user.isActive || user.tokenVersion !== payload.ver) return null;
  const { tokenVersion: _v, ...rest } = user;
  return rest;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req.headers.authorization, req.cookies?.[AUTH_COOKIE]);
  const user = await userFromToken(token);
  if (!user) throw unauthorized('Your session has expired. Please sign in again.');
  req.user = user;
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };

export function me(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
