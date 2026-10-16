# Security report

Scope: the Employee Management API (Express 5, PostgreSQL, TypeORM) as implemented in this
repository. Evidence for every control is an automated test (file names under `tests/`).

## 1. Assets and actors

| Asset | Why it matters |
|---|---|
| Employee personal data (names, emails, phones, reporting lines) | Confidentiality; GDPR obligations |
| Credentials: password hashes, refresh tokens, JWT signing secret | Account takeover, forged tokens |
| Roles and permissions | Privilege escalation |
| Audit trail | Accountability; incident investigation |

| Actor | Capability assumed |
|---|---|
| Anonymous internet user | Can send any HTTP request |
| Authenticated employee or manager | Has a valid account; may be curious or malicious |
| HR user | Broad read/write rights; must not become admin |
| Attacker with a stolen refresh or access token | E.g. via XSS on a client, a leaked log, a compromised device |
| Malicious website | Runs in a victim's browser and tries cross-origin requests |

## 2. Threats and mitigations (STRIDE summary)

| Threat | Example | Mitigation | Evidence |
|---|---|---|---|
| **Spoofing** | Forged or tampered JWT; `alg: none` | HS256 only, signature + `exp` + `iss` + `aud` + required claims; session checked per request | `unit/token.service.test.ts` |
| **Spoofing** | Password guessing | Argon2id; failed-login rate limit; generic errors; dummy-hash timing | `auth.test.ts` |
| **Tampering** | `"role": "admin"` in a body | Strict schemas; field allowlists; role-grant policy | `authorization.test.ts`, `attack-scenarios.test.ts` |
| **Tampering** | SQL injection | Bound parameters only; allowlisted sort fields; validated filters; escaped LIKE | `employees.test.ts › SQL injection` |
| **Repudiation** | "I didn't change that role" | Audit entries with actor, request id, time; written in the same transaction | `privacy.test.ts › auditing` |
| **Information disclosure** | Reading other employees by id; stack traces; hashes in responses; tokens in logs | Object-level checks with 404; generic 500; DTOs; `select: false`; log redaction | `authorization`, `security`, `auth` tests |
| **Denial of service** | Huge bodies, page sizes, login floods | 100 KB limit, page size ≤ 100, rate limits | `security.test.ts`, `employees.test.ts`, `auth.test.ts` |
| **Elevation of privilege** | HR → admin; manager → other teams; employee → admin endpoints | `requireRole`/`requirePermission`; `canAssignRole`; `employeeAccess`; no self role change | `authorization.test.ts` |

## 3. OWASP API Security Top 10 (2023)

| Risk | Controls in this API | Code |
|---|---|---|
| **API1 Broken object-level authorisation** | `employeeAccess()` on every single-record operation; managers' lists filtered in SQL; sessions revocable only by their owner; out-of-scope → `404` | `domain/employee-access.ts`, `services/employee.service.ts`, `services/auth.service.ts` |
| **API2 Broken authentication** | Argon2id; short-lived JWT with pinned algorithm and claim checks; opaque hashed refresh tokens; rotation; replay → family revocation; per-request session check; revocation on logout, password change, role change, deactivation; login rate limit; generic errors | `services/token.service.ts`, `services/auth.service.ts`, `middlewares/authenticate.ts` |
| **API3 Broken object property-level authorisation** | Strict zod schemas (unknown fields → 400); `EDITABLE_FIELDS` per access level (→ 403); explicit DTOs and views; `password_hash` is `select: false` | `validators/`, `domain/employee.ts`, `dto/` |
| **API4 Unrestricted resource consumption** | Body 100 KB; page size ≤ 100; general, login, refresh, password-change and bulk rate limits; DB pool size bounded | `app.ts`, `middlewares/rate-limit.ts`, `validators/common.ts` |
| **API5 Broken function-level authorisation** | `requirePermission` on every protected route; `requireRole('admin')` + permission on `/users`; matrix in the database | `routes/`, `middlewares/authorize.ts` |
| **API6 Unrestricted access to sensitive business flows** | Role assignment, deactivation and session revocation are admin-only and audited; exports and lists rate-limited; HR cannot grant admin/hr | `services/user.service.ts`, `domain/role.ts` |
| **API7 Server-side request forgery** | The API makes no outbound requests from user input | n/a |
| **API8 Security misconfiguration** | Helmet; strict CORS allowlist (never `*`; untrusted origin → 403); config validated at startup (secret strength, https origins in production); no `x-powered-by`; generic errors; `no-store` caching | `middlewares/cors.ts`, `config/env.ts`, `middlewares/error-handler.ts` |
| **API9 Improper inventory management** | Versioned routes (`/api/v1`); every endpoint documented (`docs/api.md`) and in the Postman collection; `/health` is the only unversioned route | `docs/api.md`, `postman/` |
| **API10 Unsafe consumption of APIs** | No third-party APIs consumed. If added: validate their responses with zod like client input, use timeouts, never forward their errors raw | n/a |

## 4. Authentication design notes

- **Refresh-token transport: HttpOnly cookie.** JavaScript cannot read it, so an XSS bug in a browser client cannot exfiltrate it. `SameSite=Strict` stops browsers from sending it on cross-site requests; together with the CORS allowlist (untrusted origins get `403` before any handler runs) this covers CSRF, so no separate CSRF token is used. `Path=/api/v1/auth` keeps it off ordinary API calls. `Secure` in production.
- **Access tokens** are returned in the body. Clients should keep them in memory only. `localStorage` is readable by any script on the page (XSS); the 15-minute lifetime and per-request session check limit the damage.
- **Logging out on the client is not enough**: every logout path revokes the session on the server, and `authenticate` checks the session on every request.

## 5. Final challenge: attack scenarios

Captured from the running server with the seeded data (request ids shortened). The same
scenarios run automatically in `tests/integration/attack-scenarios.test.ts` and in folder 5
of the Postman collection.

### 5.1 Privilege escalation with a crafted body

**Request (employee):**

```http
PATCH /api/v1/employees/me
Authorization: Bearer <employee access token>
Content-Type: application/json

{"role":"admin"}
```

**Response:**

```http
HTTP/1.1 400 Bad Request

{"error":{"code":"VALIDATION_ERROR","message":"The request is invalid","details":[
  {"path":"body.role","message":"is not an allowed field"},
  {"path":"body","message":"must contain at least one field to change"}],"requestId":"f7af02cc-…"}}
```

**Request (HR, against the role endpoint):**

```http
PATCH /api/v1/users/<hr user id>/role
Authorization: Bearer <hr access token>

{"role":"admin"}
```

**Response:** `403 {"error":{"code":"FORBIDDEN","message":"You do not have permission to perform this action",…}}`

**Controls:**
1. `updateProfileRequest` in `src/validators/employee.validators.ts` is a `z.strictObject` with only `firstName`, `lastName`, `phone`; `validateRequest` reports any other key as "is not an allowed field". The service also checks `EDITABLE_FIELDS.self`.
2. `/users` routes require `requireRole('admin')` and `requirePermission('user:assign-role')` (`src/routes/user.routes.ts`).
3. Even for admins, `UserService.changeRole` refuses self-changes and applies `canAssignRole` (HR could never grant admin even if the route allowed it).
4. Identity comes only from the verified token (`req.actor`), never from the body.

### 5.2 Broken object-level authorisation (changing the id in the URL)

**Request (employee@example.com reading sales.rep@example.com's record):**

```http
GET /api/v1/employees/<sales rep employee id>
Authorization: Bearer <employee access token>
```

**Response:**

```http
HTTP/1.1 404 Not Found

{"error":{"code":"NOT_FOUND","message":"Employee not found","requestId":"9deacdcc-…"}}
```

**Control:** `EmployeeService.getById` loads the record and calls `employeeAccess(actor,
employee)` (`src/domain/employee-access.ts`). The employee has neither
`employee:access-all` nor `employee:access-team` and is not the record's owner, so the answer
is `none` → `404`, the same response as for an id that does not exist, so the attacker
cannot even learn that the id is valid.

### 5.3 Refresh-token replay

1. The victim logs in and receives refresh token **T1** (cookie). The attacker copies T1.
2. The victim's client refreshes: `POST /auth/refresh` with T1 → `200`, new token **T2**. T1 is marked used.
3. The attacker replays T1:

```http
POST /api/v1/auth/refresh
Cookie: refresh_token=<T1>
```

```http
HTTP/1.1 401 Unauthorized

{"error":{"code":"INVALID_REFRESH_TOKEN","message":"Invalid or expired refresh token","requestId":"d9593281-…"}}
```

4. The victim's own T2 now also gets `401`, and so does the session's access token. The
   database has a new audit entry `session.reuse_detected` for the session.

**Control:** `AuthService.refresh` (`src/services/auth.service.ts`) locks the token row
(`SELECT … FOR UPDATE`), sees `revoked_at` already set, and revokes the whole token family
(session) plus all its refresh tokens, commits, then answers `401`. Because a stolen token
and the real one cannot both stay valid, a theft is detected the first time both are used,
and the session ends for both parties. The victim simply logs in again.

## 6. Residual risks and recommendations

| Risk | Current state | Recommendation |
|---|---|---|
| No multi-factor authentication | Password only | Add TOTP/WebAuthn, at least for admin and HR |
| Initial passwords set by HR/admin | No forced change on first login | Add `must_change_password`, or invitation links with one-time tokens |
| Rate limits are per process, per IP | In-memory store; attackers with many IPs | Shared store (Redis); per-account throttling and alerting on repeated failures |
| No account lockout | Only IP-based limits | Progressive delays per account (careful: lockout can be abused for DoS) |
| HS256 shared secret | One secret signs and verifies | Fine for one service; for several services use RS256/EdDSA with key rotation (`kid`) |
| Secret rotation | Changing `JWT_ACCESS_SECRET` invalidates all access tokens (≤ 15 min impact) | Support two keys during rotation |
| Audit log integrity | Ordinary table; DB admins can edit it | Ship audit events to append-only storage or a SIEM |
| Database privileges | The app's DB user also runs migrations | Separate migration role from a least-privilege runtime role (no DDL, no DELETE on `audit_logs`) |
| Dependency vulnerabilities | `npm install` reports 0 known; not automated | Run `npm audit` / Dependabot in CI |
| TLS | Terminated at the proxy, not by the app | Enforce HTTPS and HSTS at the proxy; `TRUST_PROXY_HOPS` set correctly |
| Expired session rows | Kept until the account is deleted | Periodic purge of long-expired sessions |

## 7. Unresolved compliance questions

See [privacy.md §8](privacy.md#8-questions-for-the-privacy-and-legal-team): lawful basis,
retention periods, erasure exceptions, session and log retention, backups, processors and
transfers, privacy notice / DPIA, breach procedure.
