# TaskFlow

A team task, QA and issue management app with an Asana-style workflow. It has projects, a drag-and-drop board, role-based dashboards and a real **Developer → QA → fix → retest** workflow with test reports and file evidence.

| Layer | Tech |
|---|---|
| Frontend (`frontend/`) | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, @dnd-kit, GSAP, Recharts, Socket.IO client |
| Backend (`backend/`) | Node.js, Express 5, TypeScript, Prisma 6, Zod, JWT + bcrypt, Multer, Socket.IO |
| Database | PostgreSQL ([Neon](https://neon.tech) in the cloud, or local Docker) |
| Hosting | Frontend on **Vercel**, API on **Render**, database on **Neon** (each deploys independently) |

```
taskflow/
├── backend/            Express API + Socket.IO + Prisma
│   ├── prisma/         schema.prisma, migrations/, seed.ts, create-admin.ts
│   ├── src/            app.ts, index.ts, socket.ts, routes/, services/, middleware/, jobs/
│   ├── tests/          Vitest + Supertest integration tests (real PostgreSQL)
│   └── .env.example
├── frontend/           React SPA
│   ├── src/            pages/, components/, hooks/, lib/, auth/, test/
│   ├── vercel.json     SPA fallback rewrites
│   └── .env.example
├── docs/               Product specification
├── render.yaml         Render blueprint for the API
├── docker-compose.yml  Optional local PostgreSQL
├── IMPLEMENTATION_STATUS.md
└── README.md
```

---

## 1. Run it on any Windows computer (PowerShell)

### Prerequisites
- **Git**: https://git-scm.com/download/win
- **Node.js 20 or newer** (includes npm): https://nodejs.org (use the LTS version)
- A PostgreSQL database. Either:
  - a free **Neon** database (recommended, nothing to install), or
  - **Docker Desktop** to run Postgres locally with `docker compose`.

Check your versions:
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

**A. Neon (cloud).** See [section 3](#3-neon-postgresql-setup). Put both connection strings in `backend\.env`:
```
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@ep-xxx.REGION.aws.neon.tech/neondb?sslmode=require"
```

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
npm run db:seed                # demo users, projects, tasks, QA reports (development only)
cd ..
```
The seed prints the demo accounts. The password is `SEED_PASSWORD` from `backend\.env`.

| Role | Email |
|---|---|
| Admin | admin@taskflow.dev |
| Manager | manager@taskflow.dev |
| QA | qa1@taskflow.dev, qa2@taskflow.dev |
| Developer | dev1@taskflow.dev, dev2@taskflow.dev |

> Want an empty workspace instead? Skip the seed and open **/signup**. The **first account you create becomes the Admin**. Everyone who signs up after that starts as a Developer, and an Admin can change their role.

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
Open **http://localhost:5173**. In development, Vite proxies `/api` and `/socket.io` to the API, so `VITE_API_URL` can stay empty.

### Tests
```powershell
# Backend: needs a separate, empty test database (it is wiped by the tests!)
cd backend
$env:TEST_DATABASE_URL="postgresql://taskflow:taskflow@localhost:5432/taskflow_test?schema=public"
$env:DATABASE_URL=$env:TEST_DATABASE_URL; $env:DIRECT_URL=$env:TEST_DATABASE_URL; npx prisma migrate deploy
npm test
npm run typecheck

# Frontend
cd ..\frontend
npm test
npm run typecheck
npm run build
```
With Docker, create the test database once: `docker compose exec db psql -U taskflow -c "CREATE DATABASE taskflow_test;"`. With Neon, create a separate branch or database for tests.

---

## 2. Using TaskFlow

1. **Sign up or sign in** at `/signup` or `/login`. **Log out** from the avatar menu (top right). This ends your session on every device.
2. **Admin**: *Team → User management* to add users (a temporary password is shown once), change roles, deactivate or reactivate users, and reset passwords. Admins see every project, the *Activity log* and all reports.
3. **Manager**: *Projects → New project*, add members under *Overview → Members*, then **Add task** (assignee, priority, labels, dates, **QA required** and an optional QA tester). Labels are managed in *Settings*.
4. **Developer**: open a task from *My Tasks* or the board. Drag it **To Do → In Progress**, comment, upload files, then click **Submit for QA**. If QA fails it, a red *Returned by QA* panel shows the failed test cases. Fix the issue, then click **Resubmit for QA** with a fix note.
5. **QA**: *QA Center* lists work that is ready for testing. Open a task, click **Start testing**, then **Create test report**. Add test cases (steps, expected, actual, Pass/Fail) and evidence files. A Pass moves the task to **Done** automatically. A Fail returns it to the developer as In Progress, marked *Reopened*. All reports are kept in order and cannot be edited.
6. **Board rules**: only the assignee or a Manager or Admin can drag a card. A QA-required task cannot be dropped into Done until QA passes it. The card snaps back with an explanation. Other users see every move live, without refreshing.
7. **Reports**: filter by date range and project to see tasks by status, priority and project; completions over time; overdue tasks; workload; QA pass/fail; reopened tasks; average completion time; and activity counts per person.
8. **Search and notifications**: the header search finds tasks and projects (including keys like `WEB-3`). The bell shows live notifications for assignments, QA results, @mentions and due or overdue tasks.

### Workflow decision (documented behavior)
- A **Passed** QA report automatically moves the task to Done and records the approver and time.
- A **Failed** report sets the QA status to Failed, the task status to In Progress and adds a *Reopened* badge. The task goes back to its assignee (or to whoever submitted it).
- Moving a QA-approved task **out of Done** counts as a reopen and requires a new QA cycle.
- Testers can never approve work they are assigned to or submitted themselves.

---

## 3. Neon PostgreSQL setup

1. Sign up at https://neon.tech, then go to **New Project** (choose the region closest to your Render region).
2. On the project dashboard, click **Connect**. Copy the connection string:
   - With **Connection pooling ON**, the host contains `-pooler`. Use this for `DATABASE_URL`.
   - With **Connection pooling OFF**, you get the direct host. Use this for `DIRECT_URL`. Prisma migrations use this one.
3. Both must end with `?sslmode=require`.
4. Apply the schema: `cd backend; npx prisma migrate deploy`
5. Development data (optional): `npm run db:seed`. **Never seed production.** For production, create a single admin instead:
   ```powershell
   $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a-strong-password-123"; $env:ADMIN_NAME="Your Name"
   npm run create-admin
   ```
   Or simply sign up first on the deployed site. The first account becomes the Admin.
6. Tip: create a Neon **branch** (for example `dev`) for local work, so production data stays untouched.

Connection strings live only in `.env` files and hosting dashboards. They are never committed, and never reach the frontend.

---

## 4. Deploy the API to Render

**Option A, Blueprint (uses `render.yaml`):** Render dashboard → **New → Blueprint** → pick the `taskflow` repo, then fill in `DATABASE_URL`, `DIRECT_URL` and `CORS_ORIGINS` when prompted.

**Option B, manual Web Service:**

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:prod` (runs `prisma migrate deploy` and then starts the server) |
| Health Check Path | `/api/health` |

Environment variables:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **pooled** string |
| `DIRECT_URL` | Neon **direct** string |
| `JWT_SECRET` | long random string |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` (comma-separated; wildcards like `https://*.vercel.app` allowed) |
| `ALLOW_SIGNUP` | `true` or `false` |
| `MAX_UPLOAD_MB` | `25` |
| `UPLOAD_DIR` | `./uploads` (see the note below) |

After the deploy finishes, open `https://<service>.onrender.com/api/health` and check that it returns `{"ok":true,"db":"up"}`.

**Notes**
- Socket.IO works on Render with no extra setup (WebSockets are supported).
- Cookies are sent with `Secure; SameSite=None` in production. The app also sends a Bearer token, so login still works in browsers that block third-party cookies.
- **Uploads:** Render's free plan has an *ephemeral* disk, so uploaded files are lost on redeploy (file metadata stays in Neon). For persistent files, add a Render **Disk** (paid) mounted at `/var/data` and set `UPLOAD_DIR=/var/data/uploads`. Alternatively, implement the `StorageDriver` interface in `backend/src/services/storage.ts` with S3, Cloudflare R2 or another provider.
- Free Render services sleep when idle. The first request after a pause takes about 30–50 seconds.

## 5. Deploy the frontend to Vercel

1. Go to https://vercel.com → **Add New → Project** → import the `taskflow` repo.
2. Set **Root Directory** to `frontend`. Vercel detects Vite (build `npm run build`, output `dist`).
3. Add the environment variable **`VITE_API_URL`** = `https://<your-render-service>.onrender.com` (no trailing slash).
4. Deploy. `frontend/vercel.json` already rewrites every route to `index.html`, so deep links like `/projects/123` work.
5. Copy the Vercel URL into Render's `CORS_ORIGINS` and redeploy the API.

Vercel only hosts the static React app. The Express API and Socket.IO run on Render.

---

## 6. Security summary
- Passwords are hashed with bcrypt (cost 12). JWTs are stored in an HttpOnly cookie and sent as a Bearer token. Each token carries a `tokenVersion`, so logging out, deactivating a user or changing a password revokes every session.
- Every endpoint checks authentication, role, and project or task membership on the server. Socket.IO rooms are authorized the same way.
- Inputs are validated with Zod. Errors go through a central handler that never returns stack traces.
- Helmet headers, a CORS allowlist, rate limits on login and signup (`AUTH_RATE_LIMIT`) plus a global API rate limit.
- Uploads: extension allowlist, MIME check, magic-byte sniffing and a size limit. Files get random storage names, and downloads require authorization.
- Audit trail: every workflow change is written to `ActivityEvent`. QA reports are immutable, and deleted comments are soft-deleted with their previous content kept.

## 7. Useful commands
| Command (in `backend/`) | Purpose |
|---|---|
| `npm run dev` | API with auto-reload |
| `npm run db:migrate` | Create a new migration after editing `schema.prisma` (dev) |
| `npm run db:deploy` | Apply migrations (prod/CI) |
| `npm run db:seed` | Reset and seed demo data (**wipes data**) |
| `npm run db:studio` | Browse the database |
| `npm run create-admin` | Create or promote an Admin from env vars |
