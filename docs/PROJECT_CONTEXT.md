# TaskFlow: Project Context (handoff for humans and AI assistants)

> Read this first if you are an AI assistant or a new developer. It explains what the project is, how it is built, where everything lives, what is done, and what is not. Setup steps are in `README.md`; fixes for common problems are in `docs/TROUBLESHOOTING.md`. The original product requirements are in `docs/TaskFlow_Final_Project_Specification_for_Claude_Code.md`.

_Last updated: 2026-11-17_

## 1. What TaskFlow is
A university-project team task and issue tracker with an **Asana-style** UI (not Jira-style). Teams create projects, manage tasks on a drag-and-drop board (To Do / In Progress / Done), and run a formal **QA workflow**: a Developer submits work, QA tests it and writes a test report with Pass/Fail test cases and evidence files, failed work goes back to the Developer, and passed work moves to Done.

Everything is real and database-backed. There are no mock dashboards and no frontend-only state.

## 2. Current status
- **All features in the spec are implemented and tested locally** (see `IMPLEMENTATION_STATUS.md`).
- Code is on GitHub: `https://github.com/syedakbar369/taskflow-project` (branch `main`).
- **Not yet deployed.** The target is Vercel (two projects from one repo) plus a Neon PostgreSQL database. All config is in place; deploying needs the owner's Vercel and Neon accounts.
- Tests: backend 38 (Vitest + Supertest against real Postgres), frontend 15 (Vitest + Testing Library). An 18-step Playwright browser walkthrough also passed; it lived outside the repo and is not committed.

## 3. Tech stack
| Area | Choice |
|---|---|
| Frontend | React 18, TypeScript (strict), Vite 6, Tailwind CSS 3, React Router 6, TanStack Query 5, axios, @dnd-kit, GSAP, Recharts, lucide-react, socket.io-client, react-markdown |
| Backend | Node 20+, Express 5, TypeScript (strict, `module: Node16`), Prisma 6, Zod 3, jsonwebtoken, bcryptjs, multer (memory), helmet, express-rate-limit, Socket.IO 4, @socket.io/redis-adapter + redis, @vercel/blob |
| Database | PostgreSQL (Neon in the cloud, Docker locally) |
| Hosting | Vercel: `frontend/` as a static Vite site; `backend/` as one Vercel Function (`backend/api/server.ts`) with WebSockets |

Versions are deliberately pinned to stable majors (Prisma 6, React 18, Tailwind 3, Zod 3, Vite 6). **Do not upgrade majors casually**: Prisma 7, Tailwind 4 and React 19 have breaking changes.

## 4. Repository map
```
taskflow/
├── README.md                    Setup (Windows/PowerShell), usage, Neon, Vercel deployment
├── IMPLEMENTATION_STATUS.md     Feature checklist + test results + known limitations
├── CLAUDE.md / AGENTS.md        Pointers for AI coding tools
├── docker-compose.yml           Optional local Postgres (user/pass/db = taskflow)
├── docs/
│   ├── PROJECT_CONTEXT.md       (this file)
│   ├── TROUBLESHOOTING.md       What to do when things break
│   └── TaskFlow_Final_Project_Specification_for_Claude_Code.md   Original requirements
├── backend/
│   ├── api/server.ts            VERCEL entry: exports http.Server (Express + Socket.IO). No listen().
│   ├── vercel.json              framework null, rewrites /(.*) -> /api/server, maxDuration 300, cron
│   ├── public/robots.txt        Vercel needs an output dir for "Other" projects
│   ├── prisma/
│   │   ├── schema.prisma        Data model (see §6)
│   │   ├── migrations/          SQL migrations (commit new ones!)
│   │   ├── seed.ts              Dev demo data (WIPES DB). Password = SEED_PASSWORD
│   │   └── create-admin.ts      Production admin bootstrap from ADMIN_* env vars
│   ├── src/
│   │   ├── index.ts             LOCAL dev entry: server.listen(PORT) + due-date timer
│   │   ├── app.ts               createApp(): middleware, CORS, routes, cron endpoint, error handler
│   │   ├── socket.ts            Socket.IO server: JWT auth, rooms, optional Redis adapter
│   │   ├── config/env.ts        Zod-validated env vars (app refuses to start if invalid)
│   │   ├── lib/                 prisma client, AppError helpers, jwt, zod helpers
│   │   ├── middleware/          auth.ts (requireAuth/requireRole/me), error.ts (central errors)
│   │   ├── services/
│   │   │   ├── access.ts        ALL authorization helpers (project/task membership, manage rights)
│   │   │   ├── activity.ts      logActivity() audit events
│   │   │   ├── notify.ts        notifyUsers(): persist + push via socket
│   │   │   ├── realtime.ts      broadcastProject(), emitToUser(), room sync
│   │   │   ├── storage.ts       LocalDiskStorage / VercelBlobStorage + upload validation
│   │   │   └── serializers.ts   Prisma include shapes, serializeTask() adds `key` like WEB-3
│   │   ├── routes/              auth, users, team, labels, projects, tasks, comments,
│   │   │                        attachments, qa, notifications, reports, dashboard, misc (search, activity)
│   │   └── jobs/dueDates.ts     Due-soon / overdue notifications
│   └── tests/                   *.test.ts (need a separate test DB; see README)
└── frontend/
    ├── vercel.json              SPA fallback rewrite
    └── src/
        ├── main.tsx / App.tsx   Providers + routes + role guards (RequireAuth, RequireRole)
        ├── auth/AuthContext.tsx login/signup/logout, current user
        ├── lib/                 api.ts (axios + token), socket.ts, types.ts, format.ts, board.ts, motion.ts (GSAP)
        ├── hooks/               useRealtime (socket -> cache invalidation), useBoardMove (optimistic drag), useDebounce
        ├── components/          Layout (sidebar/header/search/bell), Board, TaskDrawer, TaskFormModal,
        │                        QAReportForm, FileUploader, ProjectFormModal, Charts, ui.tsx (design kit), Toast
        └── pages/               Login, Signup, Logout, Dashboard, MyTasks, Projects, Project (board/list/overview),
                                 Team, QACenter, Reports, Notifications, Settings, Activity, Errors (404/403)
```

## 5. Roles and permissions (enforced on the backend in `services/access.ts` and the route handlers)
| Role | Can do |
|---|---|
| **ADMIN** | Everything. Sees all projects. Manages users (create with temp password, role change, deactivate, reset password). Can permanently delete archived projects. Activity log. |
| **MANAGER** | Create projects. Manage projects they are a member of (edit, archive, members, tasks, labels). Sees reports for their projects. |
| **QA** | Sees projects they belong to. Starts testing, submits QA reports (Pass/Fail) with evidence. Cannot drag cards. |
| **DEVELOPER** | Sees projects they belong to. Moves **their assigned** tasks, comments, uploads, submits/resubmits for QA. |

Rules worth knowing:
- Non-members get **403** for a project's data, including files and socket rooms.
- Assignees must be project members; QA assignees must be QA or Admin.
- **Sign-up:** the first account in an empty DB becomes ADMIN; later sign-ups are DEVELOPER (`ALLOW_SIGNUP=false` disables public sign-up).
- Logout, deactivation and password change increment `User.tokenVersion`, which **revokes all JWTs** for that user.

## 6. Data model (prisma/schema.prisma)
User, Project (has `key` like WEB, `taskCounter`), ProjectMember, Task (`number` per project gives the `WEB-3` key; `position` Float for ordering), Label/TaskLabel, Comment (soft delete, `kind` COMMENT|FIX_NOTE), Attachment (file metadata; bytes live in storage), QAReport (immutable) + QATestCase, ActivityEvent (audit log, JSON details), Notification.

Enums: Role, ProjectStatus (ACTIVE/ON_HOLD/COMPLETED/ARCHIVED), TaskStatus (TODO/IN_PROGRESS/DONE), Priority (LOW..URGENT), **QAStatus** (NOT_REQUIRED, PENDING = "not submitted", AWAITING_QA, IN_TESTING, PASSED, FAILED), TestResult.

## 7. The QA workflow (core feature)
1. Manager creates a task with `qaRequired=true` → qaStatus **PENDING**.
2. Developer clicks **Submit for QA** (`POST /api/tasks/:id/submit-for-qa`) → **AWAITING_QA**. QA and managers are notified.
3. QA clicks **Start testing** → **IN_TESTING** (optional step).
4. QA submits a report (`POST /api/tasks/:id/qa-reports`, multipart: `data` JSON + `files`):
   - **PASSED** → qaStatus PASSED, task **automatically moves to DONE**, approver recorded.
   - **FAILED** → qaStatus FAILED, task back to **IN_PROGRESS**, `reopenCount++`, returned to the developer.
5. Developer clicks **Resubmit for QA** (fix note required) → AWAITING_QA, then back to step 3.

Constraints:
- No one can drag a QA-required task to Done without a PASSED result (API returns 422; the UI reverts the card).
- Testers cannot test their own work.
- Reports are never edited or overwritten.
- Moving a passed task out of Done reopens it (new QA cycle).

## 8. API overview (all under `/api`; JSON errors look like `{ error: { code, message } }`)
- `auth`: POST signup, login, logout; GET me, config; PATCH me; POST change-password
- `users` (Admin; Manager read-only): list/create/get/patch, `/:id/status`, `/:id/role`, `/:id/reset-password`
- `team`, `labels`, `search?q=`, `activity`, `dashboard`
- `projects`: CRUD (DELETE = archive; `?permanent=true&confirm=<name>` for Admin), `/:id/restore`, `/:id/members`, `/:id/activity`, `/:projectId/tasks` (list with filters, create)
- `tasks`: GET (global search + filters + pagination), `/:id` (detail + `permissions` object for the UI), PATCH, `/:id/status`, `/:id/assignee`, `/:id/submit-for-qa`, `/:id/resubmit-for-qa`, `/:id/start-testing`, `/:id/archive`, `/:id/activity`, `/:id/comments`, `/:id/attachments`, `/:id/qa-reports`
- `comments/:id` PATCH/DELETE, `attachments/:id/download` (authorized stream), `attachments/:id` DELETE
- `qa/queue`, `qa/reports`, `qa-reports/:id`, `notifications` (+ `/:id/read`, `/read-all`), `reports/summary|tasks|qa|activity?from&to&projectId`
- `GET /api/health` (DB check), `GET /api/cron/due-dates` (needs `Authorization: Bearer CRON_SECRET`)

## 9. Real-time
- The server emits `project:changed` `{type, projectId, taskId}` to room `project:<id>`, and `notification:new` to room `user:<id>`, **only after the DB commit**.
- The frontend (`hooks/useRealtime.ts`) invalidates React Query caches on these events. After a reconnect it re-fetches everything. While disconnected it refreshes every 30s.
- The client uses `transports: ['websocket']` (required on Vercel). On Vercel, set `REDIS_URL` so events reach users connected to other function instances.

## 10. Auth details
- The JWT (`sub`, `ver`) is returned on login and stored in `localStorage` (`tf_token`), sent as `Authorization: Bearer`. It is **also** set as an HttpOnly cookie `tf_token`; the server accepts either.
- Production cookies are `Secure; SameSite=None` (frontend and backend are on different domains).

## 11. Environment variables
Backend (`backend/.env`; on Vercel → project settings):
- **Required:** `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct), `JWT_SECRET` (≥32 chars), `PORT` (local only), `CORS_ORIGINS`
- **Optional:** `NODE_ENV`, `JWT_EXPIRES_IN`, `ALLOW_SIGNUP`, `AUTH_RATE_LIMIT`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `STORAGE_DRIVER`, `REDIS_URL`, `CRON_SECRET`, `SOCKET_PATH`, `SEED_PASSWORD`, `ADMIN_EMAIL/PASSWORD/NAME`, and Blob vars added by Vercel

Frontend (`frontend/.env`): `VITE_API_URL` (empty locally), `VITE_MAX_UPLOAD_MB`, `VITE_SOCKET_PATH`.

## 12. Conventions for making changes
- Add every new endpoint in a `routes/*.ts` file, validate input with Zod `parse()`, check permissions with `services/access.ts`, write an `logActivity()` event for workflow changes, and call `broadcastProject()` / `notifyUsers()` **after** the DB transaction.
- Schema change: edit `schema.prisma`, run `npm run db:migrate -- --name <change>`, and **commit the new migration folder**.
- Frontend data: always go through TanStack Query (`queryKey` arrays like `['tasks', projectId, params]`) so real-time invalidation keeps working.
- UI building blocks live in `components/ui.tsx`. Colors are coral (accent), slate (neutral) and green, with no purple gradients.
- Before committing, run `npm run typecheck` and `npm test` in both `backend/` and `frontend/`.

## 13. Known limitations / ideas for later
- No email sending (Admins hand out temporary passwords).
- Login rate limiting is per instance on Vercel.
- Cron runs once per day on Vercel Hobby.
- WebSockets close at the function max duration (300s on Hobby) and reconnect automatically.
- Not verified on real Vercel yet: WebSocket upgrade through the `vercel.json` rewrite, and the Vercel Blob driver against a real store.
