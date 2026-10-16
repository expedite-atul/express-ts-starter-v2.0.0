# Design principles

The principles this codebase follows, each with **where you can see it** and **what
breaking it looks like**. Everything listed is in the code today.

Companion documents: [High-Level Design](hld.md) · [Low-Level Design](lld.md)

---

## 1. Structure

### Separation of concerns
Each layer does one kind of work: routes wire, controllers translate HTTP, services decide,
repositories persist, entities describe tables, the domain holds plain types and policies.
- **Here:** the `src/` folders; the layer contracts in [LLD §1.2](lld.md#12-layer-contracts).
- **Broken looks like:** a controller with a TypeORM query in it, or a service that reads `req.body`.

### Dependency rule (layers point downwards only)
Higher layers depend on lower ones, never the reverse; only repositories use TypeORM.
- **Here:** `no-restricted-imports` rules in `eslint.config.js` ([LLD §12](lld.md#12-architecture-rules-enforced-by-eslint)).
- **Broken looks like:** `import { DataSource } from 'typeorm'` in a service. `npm run lint` fails.

### Composition root
Objects are created and connected in one place, at startup, and passed in.
- **Here:** `src/container.ts` builds the services; `createApp({ config, logger, services })` builds controllers and routes; tests build the same graph against a test database.
- **Broken looks like:** `new EmployeeRepository()` inside a service method, which no test can replace.

## 2. SOLID, applied

| Principle | In this project |
|---|---|
| **S**ingle responsibility | `env.ts` only configures, `app.ts` only builds the app, `server.ts` only runs the process; `TokenService` only handles tokens, `PasswordHasher` only hashes; `EmployeeService` owns employee rules, `AuthService` sessions. |
| **O**pen/closed | A new configuration variable is one schema line built from existing helpers. A new permission is a `PERMISSIONS` entry + seed run + `requirePermission('x:y')`; the middleware does not change. A new constraint message is one entry in `database-errors.ts`. |
| **L**iskov substitution | Every repository answers "not found" the same way (`null`, never an exception), and `UnitOfWork.transaction` hands the callback the same `Repositories` shape as `uow.repositories`. Code written against one works with the other. |
| **I**nterface segregation | Services ask only for the configuration they use (`TokenConfig`, `RetentionConfig`, `RateLimitConfig`, `DatabaseConfig`), not the whole `Env`; `Repositories` exposes small focused classes. |
| **D**ependency inversion | Services depend on the `UnitOfWork` / repository methods and domain types, not on TypeORM or PostgreSQL; the concrete objects are passed in by the composition root. |

## 3. Correctness

### Fail fast
Detect a problem at the earliest point and stop.
- **Here:** `env.ts` validates everything at startup; `server.ts` refuses to start if the database is unreachable or has pending migrations.
- **Broken looks like:** `process.env.JWT_ACCESS_SECRET ?? 'dev-secret'`, which starts fine and signs production tokens with a guessable key.

### Parse, don't validate
Turn untrusted input into typed values once, at the boundary, then trust the type.
- **Here:** `env.PORT` is a `number`; `validateRequest` stores parsed, trimmed, defaulted values that controllers read with `getValidated()`.
- **Broken looks like:** `parseInt(req.query.page)` in several controllers, each with its own default.

### Single source of truth
- **Here:** configuration only in `env.ts`; uniqueness of work email enforced by `uq_employees_work_email` (the service does not pre-check it); the permission matrix in `role_permissions`; the schema defined by the entities, with migrations generated from them and a test that fails on drift.
- **Broken looks like:** checking "email already exists" in code only, so two simultaneous requests both pass.

### Atomicity
Changes that belong together commit together.
- **Here:** `uow.transaction(...)`: employee + account + audit; deactivation + account + sessions + audit; token rotation. A test forces the last step to fail and checks nothing was saved.

### Immutability where it is cheap
- **Here:** the config object is frozen; domain objects are fresh copies, so changing one never changes an entity.

## 4. Security

| Principle | Meaning | In this project |
|---|---|---|
| **Secure by default** | The safe option needs no extra effort | Strict schemas; `select: false` on the password hash; CORS refuses `*`; the placeholder secret is rejected; `synchronize: false` |
| **Deny by default** | Access needs an explicit grant | Every protected route has `requirePermission`; `employeeAccess` returns `none` unless a rule matches |
| **Least privilege** | Only what is needed | Role matrix; HR cannot grant admin; managers see their reports only, without phone numbers |
| **Defence in depth** | No single check is relied on alone | Route permission + service scope + field allowlist + database constraint; JWT + session check |
| **Never trust the client** | Identity from the verified token only | `req.actor` from `authenticate`; ids in URLs are checked, never trusted |
| **Fail securely** | Errors reveal nothing | Generic `401` for every login failure; `404` for out-of-scope records; generic `500` |
| **Secrets stay secret** | Not in code, git, logs or responses | `.env` git-ignored; config errors print names only; log redaction; refresh tokens hashed |

## 5. Privacy (GDPR-aware design)

- **Data minimisation:** no salary, address or IP addresses are stored; lists never include phone numbers.
- **Purpose limitation and need-to-know:** response views per role (`full`, `team`, list summary).
- **Privacy by design** (Art. 25): the rules shape the schema, validators and DTOs.
- **Storage limitation:** deactivation, then anonymisation by the retention job.
- **Accountability:** audit entries with field names, never values.

Details: [privacy.md](privacy.md). These features do not by themselves make an organisation compliant.

## 6. Simplicity

### KISS and YAGNI
- **Here:** no dependency-injection framework, no generic base repository, no event bus. One `UnitOfWork` class covers transactions.
- **Broken looks like:** a `GenericRepository<T>` with twenty methods, half of them unused.

### DRY, but not too early
- **Here:** shared zod helpers (`validators/common.ts`), rule helpers in `env.ts`, one `toPage`/`toPageResponse` pair. Each repository still writes its own short queries: they look alike but change for different reasons.

### Explicit over implicit
- **Here:** entities and migrations registered in explicit lists; every column type and constraint name written out; dependencies passed in; `import type` for compile-time-only imports; relative imports name their file.

## 7. Operability (Twelve-Factor App)

| Factor | In this project |
|---|---|
| III. Config in the environment | `env.ts` + `.env.example`; nothing environment-specific in code |
| IV. Backing services as attached resources | PostgreSQL is just `DATABASE_URL` |
| V. Build, release, run | `npm run build` → `npm run db:migrate:prod` → `npm start` |
| IX. Disposability | Fast startup; graceful shutdown drains HTTP and closes the pool |
| X. Dev/prod parity | Same PostgreSQL in development, tests (Docker or local) and production |
| XI. Logs as event streams | JSON to stdout; the platform collects them |
| XII. Admin processes | Migrations, seeds and retention are one-off scripts using the same code |

## 8. Testability

- `createApp(deps)` builds the app without listening; tests send requests in memory with Supertest.
- `parseEnv` is pure; `employeeAccess` and `canAssignRole` are pure functions with unit tests.
- Integration tests use a real database and the real seed data, so they test what production runs.
- **Rule of thumb:** if something is hard to test, it is usually doing two jobs. Split it.
