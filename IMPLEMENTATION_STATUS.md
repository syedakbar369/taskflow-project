# TaskFlow: Implementation Status

_Last updated: 2026-11-17_

Legend: ✅ done and verified · 🟡 done, needs an external step · ⬜ not done

## Phases
| # | Phase | Status | Verified by |
|---|---|---|---|
| 1 | Repository inspection and architecture (repo was empty except the spec) | ✅ | — |
| 2 | Auth (signup/login/logout/me, change password), schema, migrations, seed | ✅ | `auth.test.ts`, browser E2E |
| 3 | Roles + backend authorization (Admin/Manager/QA/Developer, project membership) | ✅ | `auth`, `projects-tasks`, E2E scenario 13 |
| 4 | Projects + membership (create, edit, archive/restore, permanent delete with confirmation) | ✅ | `projects-tasks.test.ts` |
| 5 | Tasks, board, drag & drop persistence with optimistic update and revert | ✅ | backend tests, `board.test.ts`, `components.test.tsx`, browser E2E |
| 6 | Comments (edit/soft-delete with audit, @mentions), labels, attachments, activity | ✅ | backend tests, browser E2E |
| 7 | QA workflow: submit → test → fail/reopen → resubmit → pass/Done, immutable reports | ✅ | `qa-workflow.test.ts`, browser E2E |
| 8 | Dashboards (role-aware), reports, notifications, Socket.IO real-time | ✅ | `files-notifications-reports.test.ts`, `realtime-e2e.test.ts`, browser E2E |
| 9 | Responsive layout, accessibility, GSAP with reduced motion | ✅ | Mobile screenshots (390px) |
| 10 | Tests and documentation | ✅ | — |
| 11 | **Vercel-only deployment** (frontend + backend as two Vercel projects) | ✅ code / 🟡 deploy | `vercel.test.ts`, browser E2E against `api/server.ts` |
| — | GitHub push | 🟡 | You push from your machine |
| — | Production deploy on Vercel + Neon | 🟡 | Needs your accounts and credentials (see README §3–4) |

## Vercel deployment work (2026-11-17)
- `backend/api/server.ts`: Vercel Function entry exporting the `http.Server` (Express + Socket.IO).
- `backend/vercel.json`: framework "Other", rewrites all paths to the function, `maxDuration: 300`, daily cron.
- Socket.IO: WebSocket-only client transport, JWT handshake auth, auto-reconnect with data re-fetch, 30s polling fallback while disconnected, optional **Redis adapter** (`REDIS_URL`) for cross-instance broadcasts.
- Uploads: private **Vercel Blob** driver (auto-selected when a Blob store is connected). 4 MB default limit on Vercel.
- Due-date reminders: `/api/cron/due-dates` protected by `CRON_SECRET` (Vercel Cron), with the local timer kept for development.
- Removed `render.yaml` and every Render/onrender reference. Env templates rewritten.
- `backend/tsconfig.json`: `moduleResolution` changed from deprecated `Node` (node10) to `Node16`. This fixes the red error in VS Code's bundled TypeScript 6.

## Test results (latest run)
- Backend: **38/38** with Redis available (37 passed + 1 skipped without `TEST_REDIS_URL`). This includes the cron endpoint, the `api/server.ts` export, and **two separate server instances relaying a live event through Redis**.
- Frontend: **15/15**.
- Browser end-to-end (Playwright, run locally): **18/18**, run against the **Vercel entry `api/server.ts`** with the WebSocket-only client and Redis adapter (signup, login, four dashboards, drag persistence, revert, live two-user sync, full QA fail→fix→pass, uploads, reports, mobile, logout).
- `tsc` strict checks pass for both apps (VS Code shows no errors). The frontend production build passes with `VITE_API_URL` set.

## Not verified (cannot be tested without your Vercel account)
- An actual Vercel deployment. Two items are confirmed from Vercel's documentation but not run on Vercel itself: (1) WebSocket upgrades on `/socket.io` reach the function through the `vercel.json` rewrite, and (2) Prisma's engine is bundled into the function. If WebSocket connections fail after deploying, see README §4c.
- The Vercel Blob driver against a real Blob store. It is written against `@vercel/blob` 2.9 (`put`/`get`/`del` with `access: 'private'`), but no real store was available locally.

## Known limitations
- Without `REDIS_URL`, real-time events only reach users connected to the same function instance (others catch up on reconnect or the 30s refresh).
- WebSocket connections are closed at the function max duration (300s on Hobby) and reconnect automatically.
- Login rate limiting is per instance. Use Vercel Firewall rules for global limits.
- Cron on the Hobby plan runs once per day.
- No email delivery: Admins share the generated temporary passwords manually.
