# TASKFLOW --- Final Product Requirements & Implementation Specification

## University Project \| Asana-style Team, Task, QA & Issue Management System

**Document purpose:** This is the single source of truth for
implementing the complete TaskFlow application. Give this document to
Claude Code and ask it to inspect the existing repository, implement the
application end-to-end, run it, test it, and document how to use it.

------------------------------------------------------------------------

## 1. Product decision

Build **TaskFlow**, a clean, modern team task and issue management web
application for small teams, student groups, freelancers, and project
teams.

The original proposal described TaskFlow as a simplified Jira-inspired
issue tracker. The final product direction is changed:

-   **Use an Asana-style user experience and visual direction.**
-   Do not copy Jira's interface, terminology, layout, or visual
    identity.
-   Do not build a Jira clone.
-   Keep the application approachable, polished, easy to learn, and
    suitable for a university project demonstration.
-   Retain the useful original proposal features: multiple
    projects/boards, tasks, assignees, statuses, comments, labels,
    search, filters, and a simple onboarding experience.
-   Add the teacher's requested roles and QA/Developer testing workflow,
    file uploads, reports, and dashboard.

The application must be genuinely functional. Do not deliver static
mockups, non-working buttons, hard-coded dashboard numbers, or
frontend-only state.

## 2. Technology stack (required)

### Frontend

-   React
-   TypeScript
-   Tailwind CSS
-   GSAP for subtle, purposeful UI animation only
-   React Router for navigation
-   A suitable drag-and-drop library such as `@dnd-kit` for task cards
-   Socket.IO client for live updates

### Backend

-   Node.js
-   Express.js
-   TypeScript
-   REST API
-   Socket.IO server for real-time updates
-   JWT-based authentication
-   Secure password hashing with bcrypt

### Database and infrastructure

-   PostgreSQL hosted on Neon
-   Prisma ORM (preferred) with migrations and typed database access
-   Environment variables for secrets and connection strings
-   File upload storage through a storage abstraction. For local
    development, use local disk storage; structure the implementation so
    cloud object storage can be configured later.
-   Deployment target: Vercel for the frontend and Render (or another
    suitable Node host) for the Express API. Neon is the PostgreSQL
    provider.

Do not put the Express API inside a Vercel-only serverless assumption.
Keep frontend and backend deployable independently.

### Engineering requirements

-   Use strict TypeScript.
-   Validate request bodies and parameters (Zod or an equivalent).
-   Centralize error handling.
-   Enforce authorization on the backend, not only by hiding frontend
    controls.
-   Use database transactions for multi-step operations where
    appropriate.
-   Never commit `.env` files, passwords, JWT secrets, or database
    credentials.
-   Provide `.env.example` files with placeholders.
-   Include database migrations and seed data.
-   Include meaningful loading, empty, success, and error states.
-   Include responsive desktop, tablet, and mobile layouts.

## 3. User roles and permissions

Implement four application roles. The handwritten note appears to list
Login Page, User Manager, QA, Developer, and Admin. Interpret **User
Manager** as the user-management capability/section, with **Manager** as
the team role.

### Admin

-   Full access to the application.
-   Create, edit, archive, and delete projects (with safe confirmation).
-   Invite/create, edit, deactivate, and manage users.
-   Assign roles: Admin, Manager, QA, Developer.
-   View all projects, tasks, QA reports, attachments, activity, and
    analytics.
-   Configure project members and task assignments.
-   View all reports and dashboards.
-   Access audit/activity history.

### Manager

-   Create and manage projects, subject to application policy.
-   Add/remove project members.
-   Create, edit, assign, prioritize, and monitor tasks.
-   Assign tasks to Developers and QA users.
-   View project progress, workload, overdue tasks, QA outcomes, and
    reports.
-   Review task history and comments.
-   Cannot change Admin privileges or access system-wide user/security
    settings unless explicitly granted by Admin.

### QA

-   View projects and tasks they are permitted to access.
-   View assigned QA work and tasks awaiting testing.
-   Create and submit test reports/test cases against a task.
-   Upload screenshots, videos, logs, and other test evidence.
-   Mark a test as Passed or Failed.
-   If failed, add a clear failure description and reopen/return the
    task to the Developer.
-   If passed, approve/close the task so it can move to Done.
-   Comment on tasks and view relevant history.
-   Cannot manage users or change roles.

### Developer

-   View projects and tasks they are permitted to access.
-   View tasks assigned to them.
-   Move work between To Do and In Progress, and submit completed work
    for QA.
-   Add implementation/fix notes and comments.
-   Upload fix evidence, screenshots, logs, or related files.
-   Respond to QA feedback and fix reopened tasks.
-   Cannot mark a QA-required task as finally Done without QA approval.
-   Cannot manage users or change roles.

### Permission enforcement

-   Every protected API endpoint must check authentication, role, and
    project/task membership.
-   A user must never gain access by changing a URL or calling an API
    directly.
-   Prevent users from assigning tasks to people who are not members of
    the relevant project.
-   Prevent users from uploading or downloading attachments for tasks
    they cannot access.
-   Show/hide navigation and actions according to role, but treat that
    as UI convenience only; backend authorization is authoritative.

## 4. Main application navigation

Create a polished authenticated application shell with a left sidebar,
top header, and responsive content area.

Suggested navigation: 1. Overview / Dashboard 2. My Tasks 3. Projects 4.
Team 5. QA Center (QA and relevant managers/admins) 6. Reports 7.
Notifications 8. Settings (role-dependent)

The header should include: - Current page/breadcrumb - Search -
Notifications - User avatar/name - Profile menu and logout

Do not overload the interface. Keep navigation clear and consistent.

## 5. Dashboard requirements

Build a real dashboard using database-backed data, with role-aware
content.

### Shared dashboard components

-   Welcome message and current user
-   Summary cards: Total Projects, Total Tasks, To Do, In Progress,
    Done, Overdue
-   Task status overview/chart
-   Recent activity feed
-   Upcoming due dates
-   Recently updated projects
-   My assigned tasks
-   Search/filter controls where appropriate

### Admin dashboard

-   Organization-wide project/task metrics
-   Total users grouped by role
-   Project progress
-   Overdue tasks
-   QA pass/fail counts
-   Recent system activity
-   Links to user management and reports

### Manager dashboard

-   Projects managed
-   Team workload
-   Tasks by status
-   Overdue and blocked tasks
-   Tasks waiting for QA
-   QA failures/reopened tasks
-   Recent project activity

### QA dashboard

-   Tasks awaiting testing
-   My assigned test tasks
-   Passed and failed tests
-   Reopened tasks
-   Recent test reports
-   Quick action to open a task and submit a test result

### Developer dashboard

-   My assigned tasks
-   To Do / In Progress / Reopened tasks
-   Tasks returned by QA
-   Upcoming deadlines
-   Recent comments and activity
-   Quick action to update progress

All dashboard metrics must be computed from real API/database data. Do
not use hard-coded sample counts outside development seed data.

## 6. Projects and project boards

Users with permission can create multiple projects.

Each project should include: - Project name (required) - Description -
Optional project key/code - Owner/Manager - Members - Created date and
updated date - Status/health (e.g. Active, On Hold, Completed,
Archived) - Optional start and target dates

Project views: - Board view (primary) - List view (useful secondary
view) - Project overview/details

The board should feel like a modern Asana-style workspace, not Jira.

### Required status columns

-   To Do
-   In Progress
-   Done

Users with permission can drag cards between columns. A successful drag
must: 1. Optimistically update the UI. 2. Send the status change to the
backend. 3. Persist it in PostgreSQL. 4. Broadcast the change through
Socket.IO to other authorized project viewers. 5. Reconcile or revert
the UI if the API fails. 6. Record an activity event.

For QA-required tasks, the Done transition must require QA approval. If
a Developer tries to move such a task directly to Done, reject the
request and show a helpful message.

Allow filtering by assignee, priority, label, due date, status, and text
search.

## 7. Tasks / issues

A task is the core work item.

### Task fields

-   Title (required)
-   Description (support basic rich text or Markdown)
-   Project
-   Status: To Do, In Progress, Done
-   Priority: Low, Medium, High, Urgent
-   Assignee (optional, but should be a project member)
-   Reporter/creator
-   Labels/tags
-   Due date (optional)
-   Created and updated timestamps
-   Optional start date
-   QA required (boolean)
-   QA status: Not Required, Awaiting QA, In Testing, Passed, Failed
-   Reopened flag or derived state
-   Attachments
-   Comments
-   Activity history

### Task actions

-   Create task
-   View task details
-   Edit task
-   Assign/reassign task
-   Change priority and due date
-   Add/remove labels
-   Add comments
-   Upload/download attachments
-   Move status
-   Submit for QA
-   View QA history and activity

Use a task detail drawer or detail page with clear sections/tabs: -
Overview - Comments - QA & Test Reports - Attachments - Activity

### Task cards

Show the task title, priority, assignee avatar/name, due date, labels,
and QA indicator where relevant. Cards should remain readable and
compact.

## 8. QA and Developer workflow (teacher's key requirement)

Implement this as a real workflow tied to tasks. It must support report
creation, evidence uploads, fixes, QA retesting, closing, and reopening.

### Workflow states and rules

1.  **Task created**
    -   Manager/Admin creates a task and assigns a Developer.
    -   Manager can set `QA required`.
    -   Task begins in To Do.
2.  **Developer starts work**
    -   Developer moves task to In Progress.
    -   Developer can add comments and upload supporting files.
3.  **Developer submits work for QA**
    -   Developer marks the implementation as ready for QA using a
        dedicated `Submit for QA` action.
    -   Task remains not Done; QA status becomes Awaiting QA.
    -   Notify assigned QA users and relevant Manager.
    -   Record who submitted it and when.
4.  **QA tests the task**
    -   QA opens the task and creates a test report.
    -   A test report should include:
        -   Report title
        -   Test summary/description
        -   Test cases or checklist (each with steps, expected result,
            actual result, and Pass/Fail)
        -   Overall result: Passed or Failed
        -   Tested by
        -   Test date/time
        -   Attachments/evidence
        -   Optional notes
    -   QA can upload evidence such as screenshots, recordings, logs, or
        documents.
5.  **If QA passes**
    -   Store the report as Passed.
    -   QA status becomes Passed.
    -   Task can move to Done (automatically or by an explicit QA
        approval action; choose one consistent behavior and document
        it).
    -   Record QA approver and timestamp.
    -   Notify the Developer and Manager.
6.  **If QA fails**
    -   Store the report as Failed, including failed test cases and
        evidence.
    -   QA status becomes Failed.
    -   Reopen/return the task to the Developer.
    -   Set task status to In Progress (or a clearly visible Reopened
        state represented as metadata while retaining the three required
        board columns).
    -   Assign/return it to the responsible Developer.
    -   Notify the Developer and Manager.
    -   Preserve previous reports and all history; never overwrite
        earlier test reports.
7.  **Developer fixes the issue**
    -   Developer sees QA feedback and failed test cases.
    -   Developer adds a fix comment/description and uploads new
        evidence.
    -   Developer uses `Resubmit for QA`.
    -   QA status returns to Awaiting QA.
    -   QA can test again and create a new report.
8.  Repeat until QA passes. Preserve the full sequence of reports and
    actions.

### Important workflow constraints

-   Do not allow a Developer to approve their own QA report.
-   Do not allow a Developer to close a QA-required task without a
    Passed QA result.
-   QA must be able to reopen a task after a failed retest, including
    after a previous pass if policy permits.
-   Keep the original three board columns (To Do, In Progress, Done).
    Show Reopened as a badge/filter or task metadata, not as a
    replacement for the required columns.
-   Every transition must be validated on the backend and written to
    activity history.
-   Use role-aware actions and helpful validation messages.

## 9. Test reports and file uploads

This is explicitly required by the teacher's handwritten notes.

### QA test report management

-   QA can create a report linked to a task.
-   A task can have multiple reports over time.
-   Reports are immutable after submission except for Admin correction
    with an audit record (or make submitted reports fully immutable;
    preferred for a clean audit trail).
-   Show report history in chronological order.
-   Show Passed/Failed status clearly.
-   Show tester, date, summary, failed test cases, and attachments.

### File upload requirements

-   Support common file types: PNG, JPG/JPEG, WEBP, PDF, TXT, CSV, ZIP,
    MP4, and log files.
-   Enforce configurable file size limits.
-   Validate file type and size on the server.
-   Generate safe unique filenames; never trust the uploaded filename as
    a storage path.
-   Store metadata in PostgreSQL: original filename, stored key/path,
    MIME type, size, uploader, task/report association, timestamp.
-   Do not store large binary files directly in PostgreSQL.
-   Users can download files only if authorized for the related
    project/task.
-   Show upload progress and clear errors.
-   Local development should work without a paid storage account.
    Provide an abstraction to switch to S3-compatible storage later.
-   Do not expose private local file paths or public unrestricted upload
    directories.

## 10. Comments, labels, search, filters, and activity

### Comments

-   Basic comment thread per task.
-   Show author, avatar/name, timestamp, and content.
-   Support edit/delete only under defined permission rules; preserve
    audit history if editing/deleting.
-   Notify relevant project members on new comments where appropriate.

### Labels/tags

-   Support categories such as Bug, Feature, Task, UI, Backend, Urgent,
    etc.
-   Labels can be created/managed by Admin/Manager.
-   Tasks can have multiple labels.

### Search and filters

-   Search projects and tasks by title/description.
-   Filter tasks by project, assignee, status, priority, label, due
    date, QA status, and reopened status.
-   Combine filters and allow clearing all filters.
-   Search must be backed by the API/database, not only the currently
    loaded cards.

### Activity history

Record events such as: - Project created/updated - Task
created/updated - Assignee changed - Priority/due date changed - Status
changed - Submitted for QA - QA report submitted - QA passed/failed -
Task reopened - Comment added - Attachment uploaded - Member
added/removed

Each event should include actor, event type, related entity, timestamp,
and useful before/after details.

## 11. Reports and analytics

Build a Reports area accessible according to role.

Required reports: - Tasks by status - Tasks by priority - Tasks by
project - Tasks completed over time - Overdue tasks - Workload by
assignee - QA reports: passed vs failed - Reopened tasks - Average time
from task creation to completion (where timestamps permit) -
Developer/QA activity summaries

Provide date-range and project filters. Use real database queries and
clearly label the date range. Charts must have empty states when there
is no data.

Do not present analytics as employee surveillance or invent productivity
scores. Report objective task/workflow counts and trends.

## 12. Notifications

Create an in-app notification center with unread count and mark-as-read
support.

Notify relevant users when: - A task is assigned or reassigned. - A task
is submitted for QA. - QA passes or fails a task. - A task is
reopened. - A comment mentions or directly concerns a user. - A due date
is approaching or a task becomes overdue (if scheduled jobs are
implemented).

Use Socket.IO to deliver live notification updates to authorized users.
Notifications should also be persisted so they remain after
logout/relogin.

## 13. Real-time behavior

Use Socket.IO for: - Task status changes - Task assignment changes - New
comments - QA report submissions and results - Notifications - Relevant
project activity updates

Requirements: - Authenticate Socket.IO connections with JWT. - Authorize
room membership on the server. - Join rooms only for projects the user
can access. - Do not broadcast private project data to all connected
clients. - Persist changes before broadcasting success. - Include
reconnection handling and refresh/re-fetch behavior after reconnect.

## 14. UI and visual design direction

### Design reference

Use the general usability principles of Asana-style project
management: - Calm, clean, friendly workspace - Clear sidebar and top
navigation - Strong hierarchy and whitespace - Readable typography -
Attractive but restrained colors - Clear status/priority indicators -
Smooth board interactions - Useful dashboards and task detail panels

Do not copy Asana branding, logos, exact screens, proprietary
illustrations, or exact styling. Create an original TaskFlow identity.

### Visual constraints

-   Do not use purple/blue gradients as the main visual identity.
-   Avoid glassmorphism, excessive shadows, glowing borders, and overly
    dark interfaces.
-   Prefer a light neutral background with a restrained accent palette
    (for example warm coral/orange, green, and slate neutrals).
-   Use consistent spacing, border radii, typography, icon sizes, and
    button styles.
-   Use GSAP sparingly: sidebar/page entrance, small dashboard count
    transitions, and subtle modal/drawer transitions. Avoid animating
    every element.
-   Respect `prefers-reduced-motion`.
-   Provide focus states and accessible color contrast.
-   Make the board usable with mouse, touch, and keyboard where
    supported.

### Required screens

1.  Login
2.  Dashboard (role-aware)
3.  Projects list
4.  Create/edit project
5.  Project overview
6.  Project board (To Do / In Progress / Done)
7.  Task create/edit form
8.  Task detail view/drawer
9.  Team/user management (Admin; limited team view for Manager)
10. QA Center
11. QA test report create/view
12. Reports and analytics
13. Notifications
14. Profile/settings
15. Not-found and access-denied pages

## 15. Database design (minimum entities)

Use PostgreSQL with Prisma. Design proper relations, indexes,
constraints, and timestamps.

Suggested models: - `User`: id, name, email (unique), passwordHash,
role, isActive, avatarUrl, createdAt, updatedAt - `Project`: id, name,
key, description, status, ownerId, startDate, dueDate, createdAt,
updatedAt, archivedAt - `ProjectMember`: id, projectId, userId,
projectRole (optional), createdAt; unique(projectId, userId) - `Task`:
id, projectId, title, description, status, priority, assigneeId,
reporterId, dueDate, qaRequired, qaStatus, reopenedAt, createdAt,
updatedAt, completedAt - `Label`: id, name, color, createdAt -
`TaskLabel`: taskId, labelId; composite unique - `Comment`: id, taskId,
authorId, content, createdAt, updatedAt - `Attachment`: id, taskId,
qaReportId (nullable), uploaderId, originalName, storageKey, mimeType,
sizeBytes, createdAt - `QAReport`: id, taskId, testerId, title, summary,
overallResult, notes, submittedAt - `QATestCase`: id, qaReportId, title,
steps, expectedResult, actualResult, result - `ActivityEvent`: id,
actorId, projectId, taskId, eventType, details JSON, createdAt -
`Notification`: id, recipientId, actorId (nullable), type, title,
message, relatedProjectId, relatedTaskId, readAt, createdAt

Add any necessary models for refresh tokens, invitations, or audit logs.
Use enum types where appropriate. Ensure deletion behavior does not
accidentally erase QA history or audit records. Prefer soft
archive/deactivation for important records.

## 16. API requirements

Implement REST endpoints with consistent response and error formats.
Suggested route groups:

### Authentication

-   `POST /api/auth/login`
-   `POST /api/auth/logout`
-   `GET /api/auth/me`
-   Optional: password change/reset endpoints

### Users (Admin)

-   `GET /api/users`
-   `POST /api/users`
-   `GET /api/users/:id`
-   `PATCH /api/users/:id`
-   `PATCH /api/users/:id/status`
-   `PATCH /api/users/:id/role`

### Projects

-   `GET /api/projects`
-   `POST /api/projects`
-   `GET /api/projects/:projectId`
-   `PATCH /api/projects/:projectId`
-   `DELETE /api/projects/:projectId` (archive preferred)
-   `POST /api/projects/:projectId/members`
-   `DELETE /api/projects/:projectId/members/:userId`

### Tasks

-   `GET /api/projects/:projectId/tasks`
-   `POST /api/projects/:projectId/tasks`
-   `GET /api/tasks/:taskId`
-   `PATCH /api/tasks/:taskId`
-   `PATCH /api/tasks/:taskId/status`
-   `PATCH /api/tasks/:taskId/assignee`
-   `POST /api/tasks/:taskId/submit-for-qa`
-   `POST /api/tasks/:taskId/resubmit-for-qa`

### Comments and attachments

-   `GET /api/tasks/:taskId/comments`
-   `POST /api/tasks/:taskId/comments`
-   `POST /api/tasks/:taskId/attachments`
-   `GET /api/attachments/:attachmentId/download`

### QA

-   `GET /api/qa/queue`
-   `GET /api/tasks/:taskId/qa-reports`
-   `POST /api/tasks/:taskId/qa-reports`
-   `GET /api/qa-reports/:reportId`

### Reports and notifications

-   `GET /api/reports/summary`
-   `GET /api/reports/tasks`
-   `GET /api/reports/qa`
-   `GET /api/notifications`
-   `PATCH /api/notifications/:id/read`
-   `PATCH /api/notifications/read-all`

Add pagination, sorting, filtering, validation, and authorization
consistently. This list is a contract guideline; adjust route structure
if needed, but preserve all functionality.

## 17. Security and reliability

-   Hash passwords with bcrypt; never store plaintext passwords.
-   Use short-lived access tokens and a secure refresh-token strategy if
    refresh tokens are implemented.
-   Prefer HttpOnly, Secure (in production), SameSite cookies for
    tokens; document local development behavior.
-   Validate and normalize email addresses.
-   Rate-limit login and other sensitive endpoints.
-   Apply secure HTTP headers and CORS allowlists.
-   Prevent SQL injection through ORM parameterization.
-   Validate uploads and prevent path traversal.
-   Do not leak stack traces, secrets, or internal paths to clients.
-   Add request logging without logging passwords/tokens.
-   Ensure deactivated users cannot log in or keep using old sessions.
-   Add sensible database indexes and pagination to avoid loading all
    records.
-   Add a safe initial Admin bootstrap process via environment variables
    or a one-time seed command. Never hard-code a production admin
    password.

## 18. Seed/demo data

Provide a development seed script that creates: - One Admin - One
Manager - Two QA users - Two Developers - At least two projects - Tasks
in all three statuses - At least one QA-required task awaiting testing -
At least one failed QA report with a reopened task - At least one passed
QA report - Comments, labels, attachments metadata (only if safe sample
files are provided), activity events, and notifications

Use clearly documented development-only credentials from environment
variables or print generated credentials once. Do not ship insecure
default credentials for production.

## 19. Testing requirements

Add automated tests for important backend rules and frontend
interactions.

### Backend tests

-   Login success/failure and inactive user rejection
-   Role and project authorization
-   Project creation and membership
-   Task CRUD
-   Task assignment membership validation
-   Valid and invalid status transitions
-   Developer cannot directly complete QA-required task
-   Developer cannot approve own QA report
-   QA pass allows completion
-   QA failure reopens/returns task to Developer
-   Multiple QA reports remain preserved
-   Attachment validation and access control
-   Notification persistence and access control
-   Dashboard/report calculations

### Frontend tests

-   Login and role-aware navigation
-   Create/edit task
-   Drag/drop status change persists
-   Failed status update reverts or reconciles UI
-   QA report submission and pass/fail states
-   Reopen workflow
-   Upload progress/error state
-   Empty/loading/error states

### End-to-end acceptance scenarios

1.  Admin logs in and creates a project.
2.  Admin/Manager adds a Manager, QA, and Developer user to the project.
3.  Manager creates a QA-required task and assigns it to a Developer.
4.  Developer moves it from To Do to In Progress.
5.  Developer adds a fix note and attachment, then submits it for QA.
6.  QA sees it in the QA queue and uploads a test report.
7.  QA marks it Failed; task is returned/reopened for Developer and
    notifications are created.
8.  Developer fixes it and resubmits.
9.  QA tests again and marks it Passed.
10. Task is allowed to move to Done.
11. Manager sees updated project metrics and activity.
12. Admin sees users, projects, tasks, QA metrics, and reports.
13. A user without project access cannot retrieve its tasks or files
    through direct API calls.

## 20. Original proposal scope and delivery timeline

The proposal estimated a six-week MVP: - Planning & Design: 1 week ---
wireframes and database schema - Core Backend: 2 weeks ---
authentication and task CRUD APIs - Frontend Build: 2 weeks --- board UI
and task views - Testing & Polish: 1 week --- bug fixes and UX
refinement - Launch: deploy a working application

For implementation, prioritize in this order: 1. Repository inspection
and architecture plan. 2. Authentication, database schema, migrations,
seed data. 3. Roles and backend authorization. 4. Projects and project
membership. 5. Tasks, board, drag/drop persistence. 6. Comments, labels,
attachments, activity. 7. QA/Developer workflow and test reports. 8.
Dashboards, reports, notifications, real-time updates. 9. Responsive
polish, accessibility, animations. 10. Automated tests, deployment
configuration, documentation.

Do not skip core functionality to build decorative dashboards first.

## 21. Success criteria

The project is complete when: - A user can sign in and sees the correct
role-based workspace. - Admin can manage users and roles. - Manager can
create projects, add team members, create tasks, and assign work. -
Board contains To Do, In Progress, Done columns. - Dragging a card
updates the database and other authorized users see the update without
refreshing. - Developers can work on tasks, comment, upload files, and
submit work for QA. - QA can create test reports, add test cases, upload
evidence, pass or fail work, and reopen failed tasks. - A failed task
returns to the Developer with the QA feedback preserved. - A passed
QA-required task can be completed. - Reports and dashboard values
reflect real database records. - Unauthorized users cannot access
protected data. - Application works on desktop and mobile. - Setup,
migrations, seed, tests, and deployment instructions are documented.

The original proposal's success metrics should also be retained where
applicable: - A new user can create a first task within two minutes of
signup/onboarding. - Board updates appear without a page refresh. - The
product is simple enough for pilot teams to use with minimal onboarding.

------------------------------------------------------------------------

# 22. Instructions to Claude Code --- execution contract

You are the senior full-stack engineer responsible for completing
TaskFlow using this specification.

**Do not simply explain how to build it. Inspect the repository and
implement it.**

Follow these instructions:

1.  Inspect the entire existing repository first: package files, app
    structure, current routes, components, database schema, environment
    configuration, and existing functionality.
2.  Preserve working code where possible. Do not blindly overwrite an
    existing project or replace useful components without understanding
    them.
3.  Compare the repository against this specification and create a
    concise implementation checklist.
4.  Identify missing, incomplete, or broken functionality.
5.  Implement the application in coherent phases, keeping the app
    runnable after each phase.
6.  Use the required stack: React, TypeScript, Tailwind CSS, GSAP,
    Node.js, Express, PostgreSQL on Neon, JWT, and Socket.IO.
7.  If a technology is already configured differently, explain the
    difference and migrate carefully rather than silently ignoring the
    required stack.
8.  Build real database-backed features. No fake buttons, placeholder
    APIs, hard-coded dashboard metrics, or frontend-only persistence.
9.  Implement backend authorization for every protected action.
10. Implement the complete QA → Developer fix → QA retest → Pass/Fail
    workflow.
11. Implement file uploads with validation and access control.
12. Add migrations, seed data, tests, `.env.example`, and
    setup/deployment documentation.
13. Run formatting, linting, type checking, unit/integration tests, and
    production builds. Fix failures rather than merely reporting them.
14. Test the main user journeys with the available browser automation
    tooling if configured.
15. Do not claim a feature works unless you have run and verified it.
16. Do not invent Neon credentials, API keys, or deployment secrets. If
    credentials are missing, implement the configuration and clearly
    tell the user which environment variables they must provide.
17. Keep the UI original and Asana-style in usability, but do not copy
    Asana branding or screens. Do not use Jira-style UI.
18. Use GSAP only for subtle, purposeful animation and respect
    reduced-motion preferences.
19. Keep a `IMPLEMENTATION_STATUS.md` checklist updated with completed,
    tested, and remaining work.
20. At the end, provide exact local setup commands, required environment
    variables, migration/seed commands, test results, and deployment
    steps.

**Definition of done:** Every required feature in this document is
implemented, connected to the database, permission-checked, and tested.
If a feature cannot be completed because an external credential or
service is unavailable, complete all code/configuration possible and
identify the exact remaining manual step. Do not silently omit
requirements.
