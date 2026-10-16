# Employee Management API

A secure REST API for managing employees, departments, login sessions and access
permissions, built with **Node.js, Express 5, TypeScript, PostgreSQL and TypeORM**.

It is a reference implementation of *LAB 5: Secure Employee Management System*: authentication
with rotating refresh tokens, role- and ownership-based authorisation, OWASP API Security
controls, GDPR-aware data handling, and automated tests for every item of the assignment's
checklist.

## Contents

- [Design documents](#design-documents)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Database](#database)
- [API overview](#api-overview)
- [Roles and permissions](#roles-and-permissions)
- [Testing](#testing)
- [Postman collection](#postman-collection)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Design documents

| Document | What it covers |
|---|---|
| [High-Level Design](docs/hld.md) | Context, layers, modules, request flow, data model, security architecture, decision log |
| [Low-Level Design](docs/lld.md) | Conventions, layer contracts, each module's interface and flows, test map |
| [Design principles](docs/design-principles.md) | The principles followed, and where to see each one in the code |
| [API reference](docs/api.md) | Every endpoint with requests, responses and errors |
| [Security report](docs/security-report.md) | Threats, OWASP API Top 10 mapping, the three attack scenarios, residual risks |
| [Privacy and data protection](docs/privacy.md) | Data inventory, purposes, access, retention, data-subject rights, open legal questions |

## Quick start

**Prerequisites:** Node.js 22 or newer (24 recommended: `nvm use`), npm, and PostgreSQL 13+
(either Docker, or a PostgreSQL server you already run).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start PostgreSQL. With Docker:

   ```bash
   docker compose up -d
   ```

   (Using your own server instead? Create an empty `employee_management` database and use its URL in step 3.)

3. Create your configuration file:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:
   - `DATABASE_URL`: with Docker, `postgresql://postgres:postgres@localhost:5432/employee_management`
   - `JWT_ACCESS_SECRET`: paste the output of `npm run secret`

4. Create the tables and load the development data:

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run db:seed
   ```

5. Start the server (restarts when a file in `src/` changes; restart it yourself after editing `.env`):

   ```bash
   npm run dev
   ```

6. Check it:

   ```bash
   curl http://localhost:3000/health
   ```

### Development accounts

`npm run db:seed` creates these **fictional** accounts. All use the password
`DevOnly-Passw0rd!`. Seeding refuses to run when `NODE_ENV=production`.

| Email | Role | Notes |
|---|---|---|
| `admin@example.com` | admin | Engineering |
| `hr@example.com` | hr | Human Resources |
| `manager@example.com` | manager | Manages the two Engineering employees below |
| `employee@example.com` | employee | Reports to manager@example.com |
| `employee2@example.com` | employee | Reports to manager@example.com |
| `sales.manager@example.com` | manager | Manages sales.rep@example.com |
| `sales.rep@example.com` | employee | Outside manager@example.com's team |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the server with `tsx`, restarting on changes in `src/` |
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run the compiled server (`dist/src/server.js`) |
| `npm test` | All unit and integration tests (needs PostgreSQL; see [Testing](#testing)) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | Type-check everything, tests included |
| `npm run lint` / `lint:fix` | ESLint, including the architecture rules |
| `npm run secret` | Print a random 64-character secret |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:revert` | Undo the most recent migration |
| `npm run db:migration:show` | List migrations and whether they have run |
| `npm run db:migration:generate -- migrations/<Name>` | Generate a migration from entity changes |
| `npm run db:migration:create -- migrations/<Name>` | Create an empty migration |
| `npm run db:seed` | Load roles, permissions, departments and development accounts |
| `npm run db:reset` | Drop everything, migrate, seed (development only) |
| `npm run db:migrate:prod` | Apply migrations from the compiled `dist/` build |
| `npm run retention:run` | Apply the data-retention policy once (schedule it daily) |

## Configuration

All configuration comes from environment variables, documented one by one in
[`.env.example`](.env.example). Locally they are read from `.env`. Deployed environments set
them through their secrets manager; real variables always win over the file.

[`src/config/env.ts`](src/config/env.ts) is the **only** file that reads `process.env` (ESLint
enforces this). It validates every variable at startup, and the app **refuses to start** if
any is missing or invalid. It lists every problem at once, by name, and never prints values:

```text
Invalid environment configuration:
  - DATABASE_URL is required
```

The server also refuses to start if the database is unreachable or has pending migrations.
Never commit `.env` or any real credential.

## Database

PostgreSQL, accessed through **TypeORM 1.x** (an ORM: entity classes ↔ tables).

- **Entities** (`src/entities/`) describe the tables, including every key, constraint and index, all explicitly named.
- **Migrations** (`migrations/`) are generated from the entities with `npm run db:migration:generate`, reviewed, and registered in `migrations/index.ts`. The schema is never changed with `synchronize`. A test fails if the entities and migrations ever drift apart.
- **Repositories** (`src/repositories/`) are the only code that queries the database. Every value is a bound parameter; they map entities to plain domain objects.
- **Transactions**: services run multi-step writes through `unitOfWork.transaction(...)`. If any step fails, everything rolls back.

```mermaid
erDiagram
    DEPARTMENTS ||--o{ EMPLOYEES : "department_id"
    EMPLOYEES |o--o{ EMPLOYEES : "manager_id"
    EMPLOYEES ||--o| USERS : "employee_id"
    ROLES ||--o{ USERS : "role_id"
    ROLES ||--o{ ROLE_PERMISSIONS : "role_id"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "permission_id"
    USERS ||--o{ SESSIONS : "user_id"
    SESSIONS ||--o{ REFRESH_TOKENS : "family_id"
    USERS |o--o{ AUDIT_LOGS : "actor_user_id"
```

| Table | Purpose | Key constraints |
|---|---|---|
| `departments` | Organisational units | `UNIQUE(name)`, name not blank |
| `employees` | Employee records | `UNIQUE(work_email)`, lower-case email, status `CHECK`, FK to department and manager, no self-management, `deactivated_at` ⇔ inactive |
| `roles` | admin, hr, manager, employee | `UNIQUE(name)` |
| `permissions` | `resource:action` names | `UNIQUE(name)` |
| `role_permissions` | Role → permission matrix | Composite PK, FKs with cascade |
| `users` | Login accounts | `UNIQUE(email)`, `UNIQUE(employee_id)`, FK to role and employee |
| `sessions` | One per login (= refresh-token family) | FK to user, revocation fields consistent |
| `refresh_tokens` | SHA-256 hashes of refresh tokens | `UNIQUE(token_hash)`, FK to user and session |
| `audit_logs` | Sensitive actions, no personal values | Indexed by time, resource and actor |

`sessions` is an addition to the assignment's table list: it lets a session be listed and
revoked as a unit, and lets every request check "is this session still valid?" in one lookup.
Full design: [HLD §6](docs/hld.md#6-data-model) and [LLD §4](docs/lld.md#4-data-access).

## API overview

Base URL `http://localhost:3000/api/v1`. JSON only. Send the access token as
`Authorization: Bearer <token>`; the refresh token travels in an HttpOnly cookie. Every
response has an `X-Request-Id` header. Full reference: [docs/api.md](docs/api.md).

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/auth/login` | anyone | Log in; returns an access token, sets the refresh cookie |
| POST | `/auth/refresh` | refresh cookie | New access token; rotates the refresh token |
| POST | `/auth/logout` | refresh cookie | End the current session |
| POST | `/auth/logout-all` | authenticated | End every session of the current user |
| GET | `/auth/sessions` | authenticated | List your active sessions |
| DELETE | `/auth/sessions/:id` | authenticated | Revoke one of your sessions |
| POST | `/auth/change-password` | authenticated | Change your password (ends every session) |
| POST | `/employees` | `employee:create` | Create an employee (and optionally a login account) |
| GET | `/employees` | `employee:list` | List: pagination, department/status filters, search, sorting |
| GET | `/employees/me` | `profile:read` | Your own profile |
| PATCH | `/employees/me` | `profile:update` | Update your name or phone |
| GET | `/employees/me/export` | `profile:export` | Download your personal data (JSON) |
| GET | `/employees/:id` | `employee:read` + scope | One employee |
| PATCH | `/employees/:id` | `employee:update` + scope + field rules | Update an employee |
| DELETE | `/employees/:id` | `employee:deactivate` | Deactivate (never deletes) |
| POST | `/departments` | `department:create` | Create a department |
| GET | `/departments` | `department:read` | List departments |
| PATCH | `/departments/:id` | `department:update` | Update a department |
| PATCH | `/users/:id/role` | admin + `user:assign-role` | Change an account's role |
| DELETE | `/users/:id/sessions` | admin + `session:revoke-any` | Revoke every session of a user |

`GET /health` (outside `/api/v1`) is the liveness check.

## Roles and permissions

Routes check **permissions** (function level). Services then check **which records** (object
level: own record, direct reports, or everyone) and **which fields** (property level).

| Permission | admin | hr | manager | employee |
|---|:-:|:-:|:-:|:-:|
| `employee:create` | ✓ | ✓ | | |
| `employee:list` | ✓ | ✓ | ✓ (team) | |
| `employee:read` | ✓ | ✓ | ✓ (team) | ✓ (self) |
| `employee:update` | ✓ | ✓ | ✓ (team, limited fields) | |
| `employee:deactivate` | ✓ | | | |
| `employee:access-all` (scope: everyone) | ✓ | ✓ | | |
| `employee:access-team` (scope: direct reports) | ✓ | | ✓ | |
| `profile:read` / `profile:update` / `profile:export` | ✓ | ✓ | ✓ | ✓ |
| `department:read` | ✓ | ✓ | ✓ | ✓ |
| `department:create` / `department:update` | ✓ | ✓ | | |
| `user:assign-role` | ✓ | | | |
| `session:revoke-any` | ✓ | | | |

Additional rules:

| Rule | Where |
|---|---|
| Fields: HR/admin may edit every employment field; a manager only `jobTitle` and `employmentStatus` of direct reports; everyone only `firstName`, `lastName`, `phone` of their own profile | `EDITABLE_FIELDS` in `src/domain/employee.ts` |
| HR may create accounts with the `employee` or `manager` role only; only an admin grants `hr` or `admin` | `canAssignRole` in `src/domain/role.ts` |
| Nobody can change their own role or deactivate themselves | `UserService`, `EmployeeService` |
| A record outside your scope answers `404`, exactly like a missing one | `employeeAccess` in `src/domain/employee-access.ts` |

The matrix lives in [`src/domain/permission.ts`](src/domain/permission.ts); `npm run db:seed`
writes it to `role_permissions`, which is the source of truth at runtime.

## Testing

Tests run against a real PostgreSQL database, because constraints, transactions and SQL
behaviour cannot be faked convincingly. The suite creates `employee_management_test` (on the
same server as `TEST_DATABASE_URL`) and applies the migrations automatically. It never touches
your development database.

```bash
npm test
```

By default the tests connect to `postgresql://postgres:postgres@localhost:5432/employee_management_test`
(the Docker setup). For another server, set `TEST_DATABASE_URL`; the database name must end in `_test`:

```bash
TEST_DATABASE_URL=postgresql://me@localhost:5432/employee_management_test npm test
```

| Folder | What |
|---|---|
| `tests/unit/` | Configuration parsing, JWT verification, validators, authorisation policies |
| `tests/integration/` | The real app over HTTP (Supertest) and a real database: auth, authorisation, data access, security, privacy, schema, startup failures, attack scenarios |

Every item of the assignment's 25-item checklist maps to named tests:
see [LLD §11](docs/lld.md#11-testing).

## Postman collection

[`postman/employee-management-api.postman_collection.json`](postman/employee-management-api.postman_collection.json)
covers every endpoint, authenticated and unauthenticated scenarios, and the three attack
scenarios, with a test on every request. Import it into Postman, or run it from the terminal
against a freshly seeded server:

```bash
npx newman run postman/employee-management-api.postman_collection.json
```

## Project structure

```text
employee-management-api/
├── src/
│   ├── server.ts            # Entry point: connect DB, listen, graceful shutdown
│   ├── app.ts               # Builds the Express app from its dependencies (no port, no DB)
│   ├── container.ts         # Composition root: creates and connects services
│   ├── config/              # env.ts (validated config), database.ts (DataSource), logger.ts
│   ├── routes/              # URL + method → middleware chain → controller
│   ├── middlewares/         # authenticate, authorize, validate, rate limit, CORS, errors, …
│   ├── controllers/         # HTTP in/out: validated input → service → DTO
│   ├── services/            # Business rules, object/property authorisation, transactions, audit
│   ├── repositories/        # TypeORM queries; entities ↔ domain objects; Unit of Work
│   ├── entities/            # TypeORM entities: the tables, constraints and indexes
│   ├── domain/              # Plain types and policies (roles, permissions, access rules)
│   ├── dto/                 # Response shapes (explicit field lists)
│   ├── validators/          # zod schemas for params, query and body (strict)
│   ├── errors/              # AppError hierarchy
│   └── types/               # Express Request augmentation
├── migrations/              # Generated, reviewed schema migrations + index.ts registry
├── seeds/                   # Reference data and fictional development accounts
├── scripts/                 # run-retention.ts
├── tests/                   # unit/, integration/, helpers/, setup/
├── postman/                 # Postman collection
├── docs/                    # HLD, LLD, principles, API, security report, privacy
├── docker-compose.yml       # Local PostgreSQL
└── .env.example             # Every configuration variable, documented
```

Requests flow one way: **Route → Middleware → Controller → Service → Repository → PostgreSQL**.
ESLint fails if code skips or reverses a layer (for example a controller importing a
repository, or a service importing Express or TypeORM).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` | The message names each bad variable. Compare your `.env` with `.env.example`. |
| `JWT_ACCESS_SECRET is still the placeholder` | Run `npm run secret` and paste the result into `.env`. |
| `Could not connect to the database` | Is PostgreSQL running (`docker compose ps`)? Is `DATABASE_URL` right? |
| `The database schema is out of date` | Run `npm run db:migrate`. |
| `Role "employee" is missing` | Run `npm run db:seed`. |
| `npm install` warns about `allow-scripts` for `esbuild`, `argon2` or `fsevents` | Safe to ignore: all three work from their prebuilt binaries. |
| Many `429 Too Many Requests` while testing | Raise `RATE_LIMIT_MAX_REQUESTS` / `AUTH_RATE_LIMIT_MAX_REQUESTS` in `.env`, or wait for the window to pass. |
| TypeScript 7 | Pinned to 6.0.x on purpose: `typescript-eslint` does not support TypeScript 7 yet. |
