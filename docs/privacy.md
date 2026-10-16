# Privacy and data protection

Employee information is personal data under the GDPR (and similar laws). This document
describes what the system stores, why, who can see it, how long it is kept and how
data-subject requests are handled.

> **Important.** These features support compliance; they do not establish it. Compliance
> depends on the organisation's actual processing, lawful basis, privacy notices, request
> procedures, contracts and security. Items marked ⚖ need a decision by the organisation's
> privacy or legal team (§8).

## 1. Principles applied

| GDPR principle (Art. 5) | How the system applies it |
|---|---|
| Data minimisation | Only the fields in §2. No salary, date of birth, home address, national id, IP addresses or free-text notes. |
| Purpose limitation | Each field has one documented purpose (§2); no analytics or marketing use. |
| Storage limitation | Deactivation instead of deletion, then anonymisation by the retention job; audit-log purge (§4). |
| Integrity and confidentiality | Argon2id passwords, hashed refresh tokens, role-based field visibility, HTTPS in deployed environments, no secrets or personal data in logs. |
| Accountability | Audit trail of sensitive actions; this document; automated tests for the controls. |
| Privacy by design (Art. 25) | Strict input schemas and explicit response DTOs: nothing is stored or shown just because it exists. |

## 2. Data inventory

**Who can read** refers to the API. Database administrators can read everything and are
covered by organisational controls, not by this application.

### `employees`

| Field | Purpose | Who can read | Who can change | Retention and deletion |
|---|---|---|---|---|
| `first_name`, `last_name` | Identify the employee at work | Everyone with access to the record; lists (admin, HR, manager for reports) | The employee (self-service), admin, HR | Replaced with "Former Employee" by the retention job |
| `work_email` | Work contact; login identifier | As above | Admin, HR (login email follows) | Replaced with `erased-<id>@invalid.invalid` |
| `phone` | Work contact | The employee, admin, HR. **Not** managers, not in lists | The employee, admin, HR | Cleared |
| `department_id`, `manager_id`, `job_title` | Organisation structure and reporting lines; authorisation scope | Everyone with access to the record | Admin, HR (manager: job title of reports) | Kept for organisational history (not identifying once names are erased; ⚖ confirm) |
| `joining_date` | Employment administration | Everyone with access to the record | Admin, HR | Kept with the anonymised record (⚖ confirm) |
| `employment_status`, `deactivated_at` | Lifecycle; access control; retention clock | Everyone with access to the record | Admin, HR (manager: active/on leave); deactivation admin only | Kept |
| `anonymised_at`, `created_at`, `updated_at` | Record keeping | As above | System | Kept |

### `users` (login accounts)

| Field | Purpose | Who can read | Retention and deletion |
|---|---|---|---|
| `email` | Login | The user (export), admin (role endpoint response) | Deleted with the account by the retention job |
| `password_hash` | Authentication (Argon2id) | **Nobody**, never returned or logged | Deleted with the account |
| `role_id` | Authorisation | The user, admin | Deleted with the account |
| `is_active`, `password_changed_at`, timestamps | Account security | The user (export) | Deleted with the account |

### `sessions` and `refresh_tokens`

| Field | Purpose | Who can read | Retention |
|---|---|---|---|
| `user_agent` (≤ 255 chars) | Lets users recognise their own sessions | The user | Deleted with the account (cascade). ⚖ Add a purge of expired sessions if required |
| timestamps, revocation reason | Session security, incident analysis | The user (own active sessions) | As above |
| `token_hash` | Validate refresh tokens; detect replay | Nobody | As above |

No IP addresses are stored.

### `audit_logs`

| Field | Purpose | Who can read | Retention |
|---|---|---|---|
| `actor_user_id`, `action`, `resource_type`, `resource_id`, `timestamp`, `request_id` | Accountability for sensitive actions | Not exposed by the API except the user's own actions in their export | Deleted after `AUDIT_LOG_RETENTION_DAYS` ⚖. Actor set to NULL when the account is erased |
| `metadata` | Which fields changed / role from → to / counts | As above | As above. **Never contains personal values** (tested) |

### Application logs (stdout)

Request id, method, path (no query string), status, duration, user id; startup and error
messages. Never passwords, tokens, cookies, hashes, request bodies or employee records
(redaction plus tests). Log retention is set by the hosting platform ⚖.

## 3. Access summary

| | Own record | Direct reports | Everyone else |
|---|---|---|---|
| **employee** | full view; edit name and phone | n/a | none (404) |
| **manager** | full view; edit name and phone | team view (no phone); edit job title and status | none (404) |
| **hr** | full | full | full; list and search; create; edit employment fields |
| **admin** | full | full | full; plus deactivate, roles, session revocation |

## 4. Retention

| Data | Rule | Setting | Mechanism |
|---|---|---|---|
| Active employees | Kept while employed | n/a | n/a |
| Deactivated employees | Anonymised after the period; login account deleted | `INACTIVE_EMPLOYEE_RETENTION_DAYS` (placeholder 2190 ≈ 6 years) ⚖ | `npm run retention:run` (schedule daily) |
| Audit entries | Deleted after the period | `AUDIT_LOG_RETENTION_DAYS` (placeholder 365) ⚖ | same job |
| Sessions / refresh tokens | Expire after `REFRESH_TOKEN_TTL_DAYS`; rows deleted with the account | n/a | cascade |
| Backups | Outside this application ⚖ | n/a | n/a |

The job is idempotent and writes an `employee.anonymise` audit entry per employee.

## 5. Data-subject rights

| Right | How it is handled |
|---|---|
| Access / portability (Art. 15, 20) | `GET /api/v1/employees/me/export`: a JSON file with the profile, account, active sessions and recent own activity. Audited. |
| Rectification (Art. 16) | Self-service for name and phone (`PATCH /employees/me`); other fields through HR (`PATCH /employees/:id`), audited. |
| Erasure (Art. 17) | Normally deactivation, then automatic anonymisation after the retention period, because employment records are usually subject to legal retention obligations. An earlier erasure request is handled by HR/legal ⚖: if approved, an administrator deactivates the employee and runs the anonymisation for that record. There is no self-service erasure endpoint on purpose. |
| Restriction / objection (Art. 18, 21) | Organisational process ⚖; deactivation restricts all processing except retention. |
| Information (Art. 13) | Privacy notice: organisational ⚖. |

## 6. Security measures relevant to privacy

Summarised from the [security report](security-report.md): Argon2id passwords; short-lived
JWTs; hashed, rotated refresh tokens with replay detection; immediate session revocation;
object- and property-level authorisation (404 for records out of scope); strict input
validation; rate limits; Helmet headers; `Cache-Control: no-store`; secrets only in the
environment; TLS in deployed environments; database constraints.

## 7. Logging and monitoring

- Logs are structured JSON for a central log platform; personal data is limited to user ids.
- Every response, log line and audit entry shares the request id, so an incident can be traced without logging content.
- Refresh-token replay writes `session.reuse_detected`: a signal worth alerting on.

## 8. Questions for the privacy and legal team

1. **Lawful basis** for each category: employment contract (Art. 6(1)(b)), legal obligation (6(1)(c)) or legitimate interest (6(1)(f))? Is a legitimate-interest assessment needed for audit logging?
2. **Retention periods** for deactivated employees' records and for audit logs, per country of employment. Should job title and joining date survive anonymisation?
3. **Erasure exceptions**: which records must be kept despite an erasure request, and for how long?
4. **Session data**: is storing the user agent acceptable? How long should expired session rows be kept?
5. **Application log retention** and who may access logs.
6. **Backups**: how are erasure and retention applied to backups?
7. **Processors and transfers**: hosting, log platform, email (if invitations are added); data processing agreements; transfers outside the EU/EEA.
8. **Privacy notice** content for employees, and whether a DPIA is required (Art. 35), e.g. if monitoring features are added.
9. **Breach procedure**: who is notified, within 72 hours (Art. 33), using the audit trail and request ids.
