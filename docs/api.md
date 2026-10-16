# API reference

Base URL: `http://localhost:3000/api/v1` (versioned; a breaking change would go to `/api/v2`).
The Postman collection in `postman/` exercises every endpoint below.

## Conventions

| Topic | Rule |
|---|---|
| Format | JSON only. A request with a body must send `Content-Type: application/json` (else `415`); max 100 KB (else `413`). |
| Authentication | `Authorization: Bearer <accessToken>` from login or refresh. |
| Refresh token | HttpOnly cookie `refresh_token` (`Path=/api/v1/auth`). Never in a body. Browsers and Postman send it automatically. |
| Unknown fields | Rejected with `400` (`"is not an allowed field"`). |
| Request id | Every response has `X-Request-Id`. Send your own (letters, digits, `.`, `_`, `-`, ≤ 64) to correlate logs. |
| Rate limits | `RateLimit` / `RateLimit-Policy` headers; `429 RATE_LIMITED` when exceeded. |
| Caching | API responses are `Cache-Control: no-store`. |
| Dates | Timestamps are ISO 8601 UTC; `joiningDate` is `YYYY-MM-DD`. |

Errors always look like this (status codes and `code` values: [LLD §10](lld.md#10-http-pipeline-and-errors)):

```json
{ "error": { "code": "NOT_FOUND", "message": "Employee not found", "requestId": "9dea…" } }
```

Lists return:

```json
{ "items": [ … ], "pagination": { "page": 1, "pageSize": 20, "totalItems": 7, "totalPages": 1 } }
```

`page` ≥ 1 (default 1); `pageSize` 1–100 (default 20). Over 100 is a `400`, not silently capped.

---

## Authentication

### `POST /auth/login`

Rate-limited (failed attempts only). Body: `{ "email": "employee@example.com", "password": "…" }`.
Emails are trimmed and lower-cased.

`200` (and `Set-Cookie: refresh_token=…; HttpOnly; SameSite=Strict; Path=/api/v1/auth`):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": { "id": "b7c3…", "email": "employee@example.com", "role": "employee", "employeeId": "8acf…" }
}
```

`401 INVALID_CREDENTIALS` "Invalid email or password": the same for an unknown email, a wrong
password and a disabled account. `400` for a malformed body.

### `POST /auth/refresh`

Uses the cookie; no body. Rate-limited. `200` `{ accessToken, tokenType, expiresIn }` plus a
**new** cookie: the old refresh token is now used up. Presenting a used token again revokes
the whole session. `401 INVALID_REFRESH_TOKEN` otherwise (the cookie is cleared).

### `POST /auth/logout`

Uses the cookie. Revokes that session (its access tokens stop working at once). `204`, also
when there is no cookie.

### `POST /auth/logout-all` (authenticated)

Revokes every session of the current user. `204`.

### `GET /auth/sessions` (authenticated)

```json
{ "items": [ { "id": "375a…", "userAgent": "PostmanRuntime/7.43", "createdAt": "…",
               "lastUsedAt": "…", "expiresAt": "…", "current": true } ] }
```

### `DELETE /auth/sessions/:id` (authenticated)

Revokes one of your own sessions. `204`; `404` if it is not yours or not active.

### `POST /auth/change-password` (authenticated, rate-limited)

Body: `{ "currentPassword": "…", "newPassword": "at least 12 characters" }`. `204`; **every**
session is revoked, including the current one, so log in again. `400` if the current password
is wrong, the new one is too short/long, or the two are equal.

---

## Employees

Employee object (`full` view):

```json
{
  "id": "8acf…", "firstName": "Emery", "lastName": "Evans", "workEmail": "employee@example.com",
  "phone": "+1-555-0103",
  "department": { "id": "3517…", "name": "Engineering" },
  "manager": { "id": "56d0…", "firstName": "Morgan", "lastName": "Miller" },
  "jobTitle": "Software Engineer", "joiningDate": "2023-02-01", "employmentStatus": "active",
  "deactivatedAt": null, "createdAt": "…", "updatedAt": "…"
}
```

The `team` view (a manager reading a direct report) omits `phone`. List items are summaries:
`id, firstName, lastName, workEmail, jobTitle, department, managerId, employmentStatus`.

### `POST /employees` (`employee:create`: admin, HR)

```json
{
  "firstName": "Nina", "lastName": "Newman", "workEmail": "nina.newman@example.com",
  "phone": "+1-555-0150", "departmentId": "3517…", "managerId": "56d0…",
  "jobTitle": "Software Engineer", "joiningDate": "2026-11-02", "employmentStatus": "active",
  "account": { "role": "employee", "password": "Initial-Password-123" }
}
```

Required: names, `workEmail`, `departmentId`, `jobTitle`, `joiningDate`. `phone`, `managerId`,
`employmentStatus` (`active`/`on_leave`, default `active`) and `account` are optional. HR may
give the account role `employee` or `manager` only. `201` with `Location`. Errors: `400`
invalid body, `403` role not grantable, `409` duplicate email, `422` unknown department or manager.

### `GET /employees` (`employee:list`: admin, HR, manager)

| Query | Values |
|---|---|
| `page`, `pageSize` | see Conventions |
| `departmentId` | UUID |
| `employmentStatus` | `active`, `on_leave`, `inactive` (inactive are hidden unless asked for) |
| `search` | 1–100 characters; matches first/last name, work email, job title (case-insensitive) |
| `sortBy` | `lastName` (default), `firstName`, `joiningDate`, `createdAt` |
| `sortOrder` | `asc` (default), `desc` |

Managers only ever see their direct reports, whatever the filters say.

### `GET /employees/:id` (`employee:read`)

Admin/HR: anyone. Manager: themselves and direct reports. Employee: themselves. Anything
else is `404`, exactly like an id that does not exist.

### `PATCH /employees/:id` (`employee:update`: admin, HR, manager)

Any subset of the create fields except `account`. Admin/HR may change all of them; a manager
only `jobTitle` and `employmentStatus` of a direct report (`403` with the offending fields
otherwise). Your own record: use `/employees/me` (`403`). Errors: `404` out of scope, `409`
duplicate email, `422` unknown department/manager, self-management, management cycle,
deactivated employee.

### `DELETE /employees/:id` (`employee:deactivate`: admin)

Deactivates: status `inactive`, account disabled, every session revoked. Nothing is deleted.
`204` (also if already inactive). `409` if the employee still manages active employees; `422`
for yourself.

### `GET /employees/me` · `PATCH /employees/me` (everyone)

`PATCH` accepts only `firstName`, `lastName`, `phone`. Anything else (`role`, `salary`,
`departmentId`, `employmentStatus`, …) is a `400` and nothing is saved.

### `GET /employees/me/export` (everyone, rate-limited)

Downloads `personal-data.json`:
`{ exportedAt, formatVersion, profile, account, activeSessions, recentActivity }`. Audited.

---

## Departments

| Method | Path | Permission | Body | Success |
|---|---|---|---|---|
| GET | `/departments` | `department:read` (everyone) | n/a (`page`, `pageSize`) | `200` list, sorted by name |
| POST | `/departments` | `department:create` (admin, HR) | `{ "name": "Legal", "description": "…" }` | `201` |
| PATCH | `/departments/:id` | `department:update` (admin, HR) | any of `name`, `description` | `200` |

Names are unique (`409`). Unknown id: `404`.

## Users (admin only)

| Method | Path | Body | Effect |
|---|---|---|---|
| PATCH | `/users/:id/role` | `{ "role": "manager" }` | `200` `{ id, email, role, employeeId }`; revokes that user's sessions; audited. Your own role: `403`. |
| DELETE | `/users/:id/sessions` | n/a | `204`; revokes every session of that user; audited. |

## Health

`GET /health` → `200 { "status": "ok" }` (no authentication, no rate limit).
