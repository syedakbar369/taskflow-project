import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  sub: string;
  ver: number;
}

export function signToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, ver: tokenVersion }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (typeof p.sub !== 'string' || typeof p.ver !== 'number') return null;
    return { sub: p.sub, ver: p.ver };
  } catch {
    return null;
  }
}

export const AUTH_COOKIE = 'tf_token';
