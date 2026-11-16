import { z, ZodTypeAny } from 'zod';
import { badRequest } from './errors';

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields = r.error.flatten().fieldErrors;
    const first = r.error.issues[0];
    const msg = first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input';
    throw badRequest(msg, fields);
  }
  return r.data;
}

export const idSchema = z.string().min(1).max(64);

/** Accepts ISO datetime, YYYY-MM-DD, null (clear) or undefined (unchanged). */
export const optionalDate = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v)));

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export function param(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}
