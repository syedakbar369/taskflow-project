# TaskFlow: Troubleshooting

Find your symptom below. If nothing matches, see **"General method"** at the end.

---

## A. Running locally

### "Request failed with status code 500" or "The API server is not responding" on every page
The website is running but the **backend isn't**. The Vite dev proxy returns 500 when nothing is listening on port 4000.
```powershell
cd backend
npm run dev
```
You need **two terminals** open the whole time: `backend` (`npm run dev`) and `frontend` (`npm run dev`).

### Backend crashes at start with "Invalid environment configuration"
`backend\.env` is missing or a value is wrong. The message names the variable.
- Did you create it? `Copy-Item backend\.env.example backend\.env`
- `JWT_SECRET` must be **at least 32 characters**.
- `DATABASE_URL` must be a real connection string, not the `USER:PASSWORD@ep-xxxx` placeholder.

### "Can't reach database server", P1001, or `/api/health` shows `"db":"down"`
- **Neon:** check the connection string (copy it again from Neon → Connect). It must end with `?sslmode=require`. Neon may be waking up from sleep, so wait 5 seconds and try again.
- **Docker:** is Docker Desktop running? Run `docker compose up -d` in the project folder, then `docker ps` should show the postgres container.
- Port 5432 already in use? Another Postgres is installed. Stop it, or change the port mapping in `docker-compose.yml` to `"5433:5432"` and use `localhost:5433` in the URL.

### `The table 'public.User' does not exist` (P2021)
Migrations haven't been applied to this database: `cd backend; npx prisma migrate deploy`.

### Login says "Incorrect email or password" with the demo accounts
- Did you run `npm run db:seed`? The demo users only exist after seeding.
- The password is the **`SEED_PASSWORD` in your `backend\.env`** (`ChangeMe123!` by default), not `Password123!`.
- Or create your own account at `/signup`; the first account becomes Admin.

### "Too many attempts. Please wait a few minutes"
The login rate limiter (30 tries per 15 minutes) kicked in. Wait, or restart the backend (the counter is in memory). For local testing you can add `AUTH_RATE_LIMIT=200` to `backend\.env`.

### `npm install` errors about Prisma / esbuild "install scripts", or "@prisma/client did not initialize yet"
```powershell
cd backend
npx prisma generate
```
If npm asks you to approve install scripts: `npm install-scripts approve prisma @prisma/client @prisma/engines esbuild`.

### Windows: `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`
A running backend is locking Prisma's file. Stop the backend (Ctrl+C), run the command again, then start it again.

### PowerShell: "running scripts is disabled on this system" (npm/npx)
Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, answer **Y**, then reopen the terminal.

### Port 4000 or 5173 already in use
Something else is using it. Close the old terminal, or find and stop it:
```powershell
Get-NetTCPConnection -LocalPort 4000 -State Listen | Select-Object OwningProcess
Stop-Process -Id <that number>
```

### The "Live" dot in the header is grey / no live updates
The socket isn't connected. Is the backend running? Check the browser console (F12) for socket errors. The app still works without it; pages refresh every 30 seconds instead.

### Uploads fail with "is not an allowed file type" / "content does not match"
Allowed types: PNG, JPG, WEBP, PDF, TXT, CSV, LOG, ZIP, MP4. The server checks the real file content, so renaming `.exe` to `.png` is rejected on purpose.

### Backend tests fail with odd data or connection errors
Tests need a **separate** database because they wipe it (README → Tests). Set `TEST_DATABASE_URL` and run `npx prisma migrate deploy` against it first. **Never point tests at your real database.**

### I changed `schema.prisma` and things broke
Run `npm run db:migrate -- --name describe_change`. This creates and applies a migration and regenerates the client. Commit the new folder in `prisma/migrations`.

### Start completely fresh (local data only)
```powershell
cd backend
npm run db:reset     # drops and recreates the DB, applies migrations (asks no questions)
npm run db:seed
```

---

## B. On Vercel

**Your main debugging tools:**
- **Vercel → your project → Deployments → (latest) → Build Logs** for build failures.
- **Logs** tab (Runtime Logs) for 500 errors while the app runs. Our backend prints the real error there.
- Open `https://<backend>.vercel.app/api/health` in the browser. `{"ok":true,"db":"up"}` means the backend and database are fine.

### Backend build fails: `prisma migrate deploy` / P1001 / P1012
- `DIRECT_URL` is missing or wrong in the backend project's Environment Variables. It must be set for the environment you're deploying (Production **and** Preview).
- P3009 (failed migration): check the Neon DB. Usually caused by running a migration twice by hand; run `npx prisma migrate resolve --applied <migration_name>` locally against that DB.

### Backend: every request returns 500 / "FUNCTION_INVOCATION_FAILED"
Look at the Runtime Logs.
- "Invalid environment configuration": a required env var is missing on Vercel. Add it, then **Redeploy** (env changes only apply to new deployments).
- Prisma "Query engine library … not found": redeploy with **Clear build cache** (Deployments → ⋯ → Redeploy, untick "Use existing build cache").

### Frontend loads but login shows "Cannot reach the server" or CORS errors in the console (F12)
- Frontend `VITE_API_URL` must be the **backend** URL, `https://…vercel.app`, **no trailing slash**. Redeploy the frontend after changing it, because it is compiled in at build time.
- Backend `CORS_ORIGINS` must contain the **exact** frontend URL (`https://taskflow.vercel.app`, no trailing slash). For preview URLs, add `https://taskflow-*.vercel.app`. Then **redeploy the backend**.

### Login works but you're logged out on refresh, or get 401 everywhere
- Make sure `NODE_ENV=production` is set on the backend.
- Changing `JWT_SECRET` logs everyone out. That's expected.

### Live updates don't work on Vercel (grey "Offline" dot)
1. F12 → Console: look for `WebSocket connection to 'wss://…/socket.io/…' failed`.
2. Check the backend Runtime Logs for errors at the same time.
3. Make sure the backend project has **Fluid compute** enabled (Settings → Functions; it's the default for new projects).
4. If the rewrite doesn't forward WebSockets, use the documented alternative path: set backend `SOCKET_PATH=/api/server/socket.io` and frontend `VITE_SOCKET_PATH=/api/server/socket.io`, then redeploy both.
5. Updates work for some users but not others → `REDIS_URL` is missing (each user is connected to a different instance). Add Redis from the Vercel Marketplace.

The app still works without WebSockets: it refreshes data every 30 seconds and when you switch back to the tab.

### File uploads fail on Vercel
- "413 / FUNCTION_PAYLOAD_TOO_LARGE": the file is over Vercel's 4.5 MB limit. Set `VITE_MAX_UPLOAD_MB=4` on the frontend so the UI blocks it up front.
- Files upload but later "The stored file is no longer available": no Blob store is connected, so files went to temporary storage. Connect a **private** Blob store to the **backend** project and redeploy.

### Due-date reminders never arrive
`CRON_SECRET` must be set on the backend. Cron jobs run only on **production** deployments, once a day at 08:00 UTC on Hobby.

### Rolling back
Vercel → Deployments → pick the last working deployment → ⋯ → **Promote to Production** (Instant Rollback). Note that database migrations are **not** rolled back automatically.

---

## C. General method (when nothing above matches)
1. **Read the actual error.** Use the browser console (F12 → Console/Network → click the red request → Response), the backend terminal, or Vercel Runtime Logs. The API returns `{ "error": { "message": "…" } }` with a readable reason.
2. **Check health:** `http://localhost:4000/api/health` locally, or `https://<backend>/api/health` on Vercel.
3. **Did it work before?** `git log --oneline` shows recent changes. `git stash` temporarily removes your uncommitted changes to test whether they caused it; `git stash pop` brings them back.
4. **Run the checks:** in `backend/` and `frontend/`, run `npm run typecheck` and `npm test`. They point at the broken file.
5. **Ask an AI assistant:** give it `docs/PROJECT_CONTEXT.md` plus the exact error message and what you were doing. With Claude Code / Cursor opened in this folder, it reads `CLAUDE.md` / `AGENTS.md` automatically.
6. Do not run `npm run db:seed` or `db:reset` against the production database. They wipe all data.
