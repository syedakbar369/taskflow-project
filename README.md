# TaskFlow

> **New here or an AI assistant?** Read [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) for the full project overview. If something breaks, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

A team task, QA and issue management app with an Asana-style workflow. It has projects, a drag-and-drop board, role-based dashboards and a real **Developer → QA → fix → retest** workflow with test reports and file evidence.

| Layer | Tech |
|---|---|
| Frontend (`frontend/`) | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, @dnd-kit, GSAP, Recharts, Socket.IO client |
| Backend (`backend/`) | Node.js, Express 5, TypeScript, Prisma 6, Zod, JWT + bcrypt, Multer, Socket.IO |
| Database | PostgreSQL on [Neon](https://neon.tech) (or local Docker for development) |
| Hosting | **Two Vercel projects from this one repo**: `frontend/` (static Vite site) and `backend/` (Express + Socket.IO as a Vercel Function) |

```
taskflow/
├── backend/
│   ├── api/server.ts   Vercel Function entry (exports the http server: Express + Socket.IO)
│   ├── src/            app.ts, index.ts (local dev server), socket.ts, routes/, services/, jobs/
│   ├── prisma/         schema.prisma, migrations/, seed.ts, create-admin.ts
│   ├── tests/          Vitest + Supertest integration tests (real PostgreSQL)
│   ├── public/         required static output dir for Vercel (robots.txt only)
│   ├── vercel.json     backend Vercel config (rewrites, cron, function duration)
│   └── .env.example
├── frontend/
│   ├── src/            pages/, components/, hooks/, lib/, auth/, test/
│   ├── vercel.json     SPA fallback rewrites
│   └── .env.example
├── docs/               Product specification
├── docker-compose.yml  Optional local PostgreSQL
├── IMPLEMENTATION_STATUS.md
└── README.md
```

---

## 1. Run it on any Windows computer (PowerShell)

### Prerequisites
- **Git**: https://git-scm.com/download/win
- **Node.js 20 or newer** (includes npm): https://nodejs.org (use the LTS version)
- A PostgreSQL database: a free **Neon** database (recommended), or **Docker Desktop** for a local one.

```powershell
git --version
node -v
npm -v
```

### Step 1: Clone the repository
```powershell
cd $HOME\Desktop
git clone https://github.com/<your-github-username>/taskflow.git
cd taskflow
```

### Step 2: Install dependencies
```powershell
cd backend;  npm install;  cd ..
cd frontend; npm install;  cd ..
```
> With npm 11+, install scripts for Prisma and esbuild are pre-approved in each `package.json` (`allowScripts`).

### Step 3: Create your `.env` files
```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```
Generate a JWT secret and paste it into `backend\.env` as `JWT_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Step 4: Connect a database (choose A or B)

**A. Neon.** Follow [section 3](#3-neon-postgresql-connection-strings) and put both strings into `backend\.env`.

**B. Local Docker Postgres:**
```powershell
docker compose up -d
```
and in `backend\.env`:
```
DATABASE_URL="postgresql://taskflow:taskflow@localhost:5432/taskflow?schema=public"
DIRECT_URL="postgresql://taskflow:taskflow@localhost:5432/taskflow?schema=public"
```

### Step 5: Run migrations and seed demo data
```powershell
cd backend
npx prisma migrate deploy      # creates all tables
npm run db:seed                # demo data (development only, wipes existing data)
cd ..
```
Demo accounts (the password is `SEED_PASSWORD` from `backend\.env`, `ChangeMe123!` by default):

| Role | Email |
|---|---|
| Admin | admin@taskflow.dev |
| Manager | manager@taskflow.dev |
| QA | qa1@taskflow.dev, qa2@taskflow.dev |
| Developer | dev1@taskflow.dev, dev2@taskflow.dev |

> Want an empty workspace instead? Skip the seed and open **/signup**. The **first account becomes the Admin**, and later sign-ups start as Developers.

### Step 6: Start the app (two terminals)
```powershell
# Terminal 1: API on http://localhost:4000
cd backend
npm run dev
```
```powershell
# Terminal 2: web app on http://localhost:5173
cd frontend
npm run dev
```
Open **http://localhost:5173**. In development, Vite proxies `/api` and `/socket.io` to the API, so `VITE_API_URL` stays empty.

### Tests
```powershell
# Backend: needs a SEPARATE, empty test database (the tests wipe it)
cd backend
$env:TEST_DATABASE_URL="postgresql://taskflow:taskflow@localhost:5432/taskflow_test?schema=public"
$env:DATABASE_URL=$env:TEST_DATABASE_URL; $env:DIRECT_URL=$env:TEST_DATABASE_URL; npx prisma migrate deploy
npm test                 # optional: set $env:TEST_REDIS_URL="redis://localhost:6379" to include the multi-instance Socket.IO test
npm run typecheck

# Frontend
cd ..\frontend
npm test
npm run typecheck
npm run build
```
With Docker, create the test database once: `docker compose exec db psql -U taskflow -c "CREATE DATABASE taskflow_test;"`.

---

## 2. Using TaskFlow

1. **Sign up or sign in** at `/signup` or `/login`. **Log out** from the avatar menu (top right). This ends your session on every device.
2. **Admin**: *Team → User management* to add users (a temporary password is shown once), change roles, deactivate users and reset passwords. Admins see every project, the *Activity log* and all reports.
3. **Manager**: *Projects → New project*, add members under *Overview → Members*, then **Add task** (assignee, priority, labels, dates, **QA required**, optional QA tester).
4. **Developer**: open a task, drag it **To Do → In Progress**, comment, upload files, then click **Submit for QA**. If QA fails it, a red *Returned by QA* panel lists the failed test cases. Fix the issue, then click **Resubmit for QA** with a fix note.
5. **QA**: *QA Center* lists work that is ready for testing. Open a task, click **Start testing**, then **Create test report** with test cases (Pass/Fail) and evidence. A Pass moves the task to **Done** automatically. A Fail returns it to the developer marked *Reopened*. Reports are kept in order and cannot be edited.
6. **Board rules**: only the assignee or a Manager or Admin can drag a card. A QA-required task can't go to Done until QA passes it; the card snaps back with an explanation. Other users see moves live.
7. **Reports**, **search** (including keys like `WEB-3`) and the **notification bell** are all backed by the database.

---

## 3. Neon PostgreSQL connection strings

1. Sign up at https://neon.tech, then go to **New Project**. Pick the region closest to your Vercel Functions region (Vercel's default is `iad1`, US East, so choose **AWS US East (N. Virginia)**).
2. On the project dashboard, click **Connect**:
   - **Connection pooling ON**: the host contains `-pooler`. This is **`DATABASE_URL`**, used by the app at runtime. Serverless functions open many short connections, so the pooler is required.
   - **Connection pooling OFF**: the direct host. This is **`DIRECT_URL`**, used by `prisma migrate`.
3. Both must end with `?sslmode=require`:
   ```
   DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
   DIRECT_URL="postgresql://USER:PASSWORD@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
   ```
4. **Branches:** create a Neon branch (for example `dev`) for local work and Vercel *Preview* deployments, and keep the `main` branch for *Production*. Each Vercel environment then migrates its own database.
5. Apply the schema manually if you like: `cd backend; npx prisma migrate deploy`. The backend's Vercel build also runs it automatically (see below).
6. **Never run the seed against production.** To create the first admin, either sign up on the deployed site (the first account becomes Admin), or run:
   ```powershell
   $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a-strong-password-123"; $env:ADMIN_NAME="Your Name"
   npm run create-admin
   ```

Connection strings live only in `.env` files and in Vercel's environment settings. They are never committed and never reach the frontend.

---

## 4. Deploy to Vercel (two projects, one repository)

Push the repo to GitHub first. Then create **two** projects in Vercel, both importing the same `taskflow` repository.

### 4a. Backend project (Express API + Socket.IO)

**Vercel → Add New → Project → import `taskflow`**

| Setting | Value |
|---|---|
| Project name | e.g. `taskflow-api` |
| **Root Directory** | `backend` |
| Framework Preset | **Other** (already set by `backend/vercel.json` → `"framework": null`) |
| Build Command | from `vercel.json`: `npm run vercel-build` (runs `prisma generate && prisma migrate deploy`) |
| Output Directory | from `vercel.json`: `public` |
| Install Command | `npm install` (also runs `prisma generate` via `postinstall`) |
| Node.js version | 20.x or 22.x (Project → Settings → Build and Deployment) |

How it works:
- `backend/api/server.ts` exports an `http.Server` with the Express app and Socket.IO attached. Vercel runs it as **one Vercel Function** on Fluid compute.
- `backend/vercel.json` rewrites **every path** (`/api/*`, `/socket.io/*`) to that function, so the API keeps its normal URLs.
- `src/index.ts` (with `app.listen` and an in-process timer) is only for local development.

**Backend environment variables** (Project → Settings → Environment Variables):

| Name | Required | Value / notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon **pooled** string. Use different Neon branches for Production and Preview. |
| `DIRECT_URL` | ✅ | Neon **direct** string (used by `prisma migrate deploy` during the build) |
| `JWT_SECRET` | ✅ | Long random string (64+ characters) |
| `CORS_ORIGINS` | ✅ | Your frontend URL(s), comma-separated, e.g. `https://taskflow.vercel.app,https://taskflow-*.vercel.app` |
| `NODE_ENV` | recommended | `production` (enables Secure/SameSite=None cookies and proxy trust) |
| `REDIS_URL` | recommended | Redis connection URL (Vercel Marketplace → Redis, e.g. Upstash `rediss://…`). Needed for real-time events to reach users connected to other function instances; see 4c. |
| `CRON_SECRET` | recommended | Random string. Vercel Cron sends it automatically to `/api/cron/due-dates`. |
| `BLOB_STORE_ID` / `BLOB_READ_WRITE_TOKEN` | recommended | Added automatically when you connect a **private Vercel Blob store** (Storage → Blob → Create → Private → Connect to project). The app then switches to Blob storage on its own. |
| `MAX_UPLOAD_MB` | optional | Defaults to `4` on Vercel (Vercel's request body limit is 4.5 MB) |
| `ALLOW_SIGNUP` | optional | `true` (default) or `false` |
| `JWT_EXPIRES_IN` | optional | `12h` |
| `PORT` | not used on Vercel | only for local development |

After deploying, open `https://<backend-project>.vercel.app/api/health` and check that it returns `{"ok":true,"db":"up"}`.

### 4b. Frontend project (React + Vite)

**Vercel → Add New → Project → import `taskflow` again**

| Setting | Value |
|---|---|
| Project name | e.g. `taskflow` |
| **Root Directory** | `frontend` |
| Framework Preset | **Vite** (auto-detected; also set in `frontend/vercel.json`) |
| Build Command | `npm run build` |
| Output Directory | `dist` |

`frontend/vercel.json` rewrites all routes to `index.html`, so deep links like `/projects/123` work.

**Frontend environment variables:**

| Name | Required | Value |
|---|---|---|
| `VITE_API_URL` | ✅ | Backend URL, no trailing slash, e.g. `https://taskflow-api.vercel.app` |
| `VITE_MAX_UPLOAD_MB` | recommended | `4`, so the UI limit matches the Vercel body limit |
| `VITE_SOCKET_PATH` | optional | `/socket.io` (default) |

`VITE_*` values are compiled into the JavaScript bundle and are public. Never put secrets in them.

**Order of operations**
1. Deploy the **backend** and copy its URL.
2. Set `VITE_API_URL` on the **frontend** project and deploy it.
3. Put the frontend URL in the backend's `CORS_ORIGINS` and **redeploy the backend**, because environment changes only apply to new deployments.

### 4c. Real-time (Socket.IO) on Vercel: how it works and its limits

Vercel Functions support WebSockets ([docs](https://vercel.com/docs/functions/websockets)). TaskFlow is configured for that:

- **Transport:** the client uses `transports: ['websocket']`, as Vercel requires. HTTP long-polling requests could land on different instances, so they're disabled in the client.
- **Authentication:** the JWT is sent in the Socket.IO handshake (`auth.token`); the HttpOnly cookie is a fallback. Rooms are authorized on the server (`user:<id>` and the `project:<id>` rooms the user can access).
- **Max duration:** a WebSocket lives inside a function invocation, so it is closed when the function reaches its max duration (`maxDuration: 300` seconds in `backend/vercel.json`; 300s is the Hobby maximum, and Pro can raise it to 800). The client **reconnects automatically**, and on every reconnect the app **re-fetches all visible data**, so nothing is missed. While disconnected, the app also refreshes visible data every 30 seconds.
- **Multiple instances:** each connection is pinned to one instance, and a REST request (for example a card drag) can run on a different instance. Without `REDIS_URL`, that instance can't reach sockets held elsewhere, so some users would only see changes after the next refresh or reconnect. **Set `REDIS_URL`**: the Socket.IO Redis adapter relays every broadcast between instances. This is covered by an automated test that runs two separate server instances.
- **Billing:** open WebSocket connections count as active function time. See Vercel's Functions pricing.

### 4d. Other serverless differences (already handled)

| Concern | What TaskFlow does on Vercel |
|---|---|
| Read-only, non-persistent filesystem | Uploads use a **private Vercel Blob** store (`VercelBlobStorage`). Downloads still go through the authorized `/api/attachments/:id/download` route. Without a Blob store, files land in `/tmp` and **will not persist** (a warning is logged). |
| 4.5 MB request body limit | Upload limit defaults to 4 MB on Vercel. Set `VITE_MAX_UPLOAD_MB=4` on the frontend. |
| No background timers | Due-date reminders run via **Vercel Cron** (`backend/vercel.json` → `/api/cron/due-dates`, daily at 08:00 UTC; Hobby allows daily schedules). Requires `CRON_SECRET`. |
| Cross-site cookies (`*.vercel.app` domains count as different sites) | Cookie is `Secure; SameSite=None` in production. The app also sends a Bearer token, so it works when browsers block third-party cookies. |
| Rate limiting is per instance (in memory) | Login is limited per instance. For stricter global limits, add Vercel Firewall rate-limit rules on `/api/auth/login`. |
| Prisma migrations | `npm run vercel-build` runs `prisma migrate deploy` against `DIRECT_URL` on every deployment. Point Preview deployments at a Neon **branch**. |

---

## 5. Security summary
- Passwords are hashed with bcrypt (cost 12). JWTs are stored in an HttpOnly cookie and sent as a Bearer token. A `tokenVersion` lets logout, deactivation or a password change revoke every session.
- Every endpoint checks authentication, role, and project or task membership on the server. Socket.IO rooms are authorized the same way.
- Inputs are validated with Zod. A central error handler never returns stack traces. Helmet headers, a CORS allowlist and rate limits are in place.
- Uploads: extension allowlist, MIME check, magic-byte sniffing and a size limit. Files get random storage keys, live in private storage, and downloads require authorization.
- Audit trail in `ActivityEvent`. QA reports are immutable, and deleted comments are soft-deleted with their previous content kept.

## 6. Useful commands
| Command (in `backend/`) | Purpose |
|---|---|
| `npm run dev` | Local API with auto-reload (port `PORT`, default 4000) |
| `npm run db:migrate` | Create a new migration after editing `schema.prisma` (dev) |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Reset and seed demo data (**wipes data**, dev only) |
| `npm run db:studio` | Browse the database |
| `npm run create-admin` | Create or promote an Admin from env vars |
| `npm run vercel-build` | What Vercel runs: `prisma generate && prisma migrate deploy` |
