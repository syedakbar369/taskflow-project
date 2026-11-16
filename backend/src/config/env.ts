import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  ALLOW_SIGNUP: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),
  COOKIE_SECURE: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See backend/.env.example');
}

const e = parsed.data;
export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  corsOrigins: e.CORS_ORIGINS.split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  maxUploadBytes: Math.round(e.MAX_UPLOAD_MB * 1024 * 1024),
  // Cross-site (Vercel -> Render) cookies require Secure + SameSite=None.
  cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
};
