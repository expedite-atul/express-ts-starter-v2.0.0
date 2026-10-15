# Design principles

The principles this codebase follows, each with **where you can see it** and **what
breaking it looks like**. "Built" means it is in the code today; "Planned" means the
phase that builds that part must follow it.

Companion documents: [High-Level Design](hld.md) · [Low-Level Design](lld.md)

---

## 1. Structure

### Separation of concerns
Each layer does one kind of work: routes wire, controllers translate HTTP, services decide, repositories persist.
- **Here:** the `src/` folders; the layer contracts in [LLD §1.2](lld.md#12-layer-contracts). Built (folders, lint rules).
- **Broken looks like:** a controller with SQL in it, or a service that reads `req.body`.

### Dependency rule (layers point downwards only)
Higher layers depend on lower ones, never the reverse; only repositories touch PostgreSQL.
- **Here:** enforced by `no-restricted-imports` in `eslint.config.js`. Built.
- **Broken looks like:** `import { pool } from 'pg'` in a controller. `npm run lint` fails.

### Composition root
Objects are created and connected in one place, at startup, and passed in, rather than each module creating its own dependencies.
- **Here:** `server.ts` builds the app; `createApp()` will receive its services as arguments. Built (partly) / Planned.
- **Broken looks like:** `new EmployeeRepository()` inside a service method, which tests cannot replace.

## 2. SOLID, applied

| Principle | In this project | Status |
|---|---|---|
| **S**ingle responsibility | `env.ts` only configures, `app.ts` only builds the app, `server.ts` only runs the process. A service owns one area's rules. | Built |
| **O**pen/closed | New configuration = one schema line built from existing helpers. New permission = a seed row + `requirePermission('x:y')`; the middleware itself does not change. | Built / Planned |
| **L**iskov substitution | A fake repository used in tests must keep the real one's contract (e.g. return `null` when not found, not throw), or tests prove nothing. | Planned |
| **I**nterface segregation | A service depends on the few repository methods it uses, not on a do-everything database object. | Planned |
| **D**ependency inversion | Services depend on repository interfaces passed in at the composition root, not on `pg` directly. | Planned |

## 3. Correctness

### Fail fast
Detect a problem at the earliest point and stop, instead of limping on.
- **Here:** `env.ts` validates everything at startup and exits with a clear list. Built.
- **Broken looks like:** `process.env.JWT_ACCESS_SECRET ?? 'dev-secret'`, which starts fine and signs production tokens with a guessable key.

### Parse, don't validate
Turn untrusted input into typed values once, at the boundary, then trust the type everywhere else.
- **Here:** `env.PORT` is a `number` and `env.CORS_ORIGINS` a `string[]`; nobody re-checks them. Request bodies get the same treatment via `validate(schema)`. Built / Planned.
- **Broken looks like:** `parseInt(process.env.PORT)` scattered across files, each with its own idea of a default.

### Single source of truth
Each fact is defined in exactly one place.
- **Here:** configuration lives only in `env.ts` (lint-enforced). Uniqueness of work email is enforced by a database constraint; application checks only make the error message friendlier. Built / Planned.
- **Broken looks like:** checking "email already exists" in code only, so two simultaneous requests both pass.

### Immutability where it is cheap
- **Here:** the config object is frozen. Domain objects are not mutated after a repository returns them. Built / Planned.

## 4. Security

| Principle | Meaning | In this project |
|---|---|---|
| **Secure by default** | The safe option needs no extra effort | Strict schemas reject unknown fields; CORS refuses `*`; the placeholder JWT secret is rejected |
| **Deny by default** | Access requires an explicit grant | A route without `requirePermission` is a review finding; roles start with no permissions |
| **Least privilege** | Each role, user and DB account gets only what it needs | Role-permission matrix; the app's DB user is not a superuser |
| **Defence in depth** | No single check is relied on alone | Route permission + service ownership/scope check + database constraints |
| **Never trust the client** | Identity comes from the verified token, never from the body or URL | `req.user` from `authenticate`; `"role": "admin"` in a body is rejected |
| **Secrets stay secret** | Never in code, git, logs or error messages | `.env` git-ignored; config errors print names, not values; log redaction |

## 5. Privacy (GDPR-aware design)

- **Data minimisation:** store only the fields with a documented purpose (see the data inventory, a later deliverable).
- **Purpose limitation and need-to-know:** response DTOs show each role only the fields it needs.
- **Privacy by design** (GDPR Art. 25): these rules shape the schema and the APIs from the start, not as a patch.
- **Accountability:** sensitive actions are audited.

Implementing these features does not by itself make an organisation GDPR-compliant;
see the open questions in [HLD §11](hld.md#11-open-questions).

## 6. Simplicity

### KISS and YAGNI
Choose the simplest design that meets today's requirement; do not build for imagined ones.
- **Here:** no dependency-injection framework, no ORM, no base classes "for later". Folders exist but stay empty until a phase needs them.
- **Broken looks like:** a `GenericRepository<T>` written before there are two repositories to compare.

### DRY, but not too early
Remove duplication once the pattern is clear (rule of three), not on first sight.
- **Here:** `env.ts` has rule helpers (`requiredString`, `integer`, `secret`) because many variables share the same rule.

### Explicit over implicit
- **Here:** dependencies are imported or passed in, never read from globals; `import type` marks compile-time-only imports; every relative import names its file.

## 7. Operability (Twelve-Factor App)

| Factor | In this project |
|---|---|
| III. Config in the environment | `env.ts` + `.env.example`; nothing environment-specific in code |
| IV. Backing services as attached resources | PostgreSQL is just a `DATABASE_URL`; point at another instance by changing configuration only |
| IX. Disposability | Fast startup; graceful shutdown on `SIGTERM` |
| X. Dev/prod parity | Same code path everywhere; only configuration differs |
| XI. Logs as event streams | Write to stdout/stderr; the platform collects them |

## 8. Testability

- **Here:** `createApp()` builds the app without listening, so tests send requests in memory. `parseEnv` is a pure function, testable with plain objects. Services will take their repositories as arguments, so tests can substitute them.
- **Rule of thumb:** if something is hard to test, it is usually doing two jobs. Split it.
