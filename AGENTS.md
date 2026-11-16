# Instructions for AI coding assistants

This is **TaskFlow**, a full-stack task + QA workflow app (React/Vite frontend, Express/Prisma/Socket.IO backend, PostgreSQL on Neon, deployed as two Vercel projects).

Before doing anything, read:
1. `docs/PROJECT_CONTEXT.md`: architecture, file map, roles, QA workflow, API, conventions, current status
2. `docs/TROUBLESHOOTING.md`: known problems and fixes
3. `README.md`: setup and deployment
4. `IMPLEMENTATION_STATUS.md`: what is done and tested

Ground rules:
- Authorization is enforced on the backend (`backend/src/services/access.ts`). Never rely on hiding UI only.
- Validate input with Zod. Log workflow changes with `logActivity()`. Broadcast/notify only after DB commits.
- Schema changes need a Prisma migration (`npm run db:migrate -- --name x`), and the migration folder must be committed.
- Keep major versions pinned (Prisma 6, React 18, Tailwind 3, Zod 3).
- Never commit `.env` files or real credentials. Never run `db:seed` / `db:reset` against production.
- Run `npm run typecheck` and `npm test` in `backend/` and `frontend/` after changes.
