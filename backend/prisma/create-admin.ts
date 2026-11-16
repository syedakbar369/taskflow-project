/**
 * Safe production bootstrap: creates (or promotes) a single Admin from environment variables.
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password1' ADMIN_NAME='Your Name' npm run create-admin
 * Nothing is hard-coded; the password is never printed.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables');
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('ADMIN_PASSWORD must be at least 10 characters and include letters and numbers');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role: 'ADMIN' },
    update: { role: 'ADMIN', isActive: true, passwordHash, tokenVersion: { increment: 1 } },
  });
  console.log(`Admin ready: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
