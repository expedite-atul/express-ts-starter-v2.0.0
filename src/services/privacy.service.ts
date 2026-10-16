import type { Actor } from '../domain/actor.ts';
import type { AuditRecord } from '../domain/audit.ts';
import type { Employee } from '../domain/employee.ts';
import type { Session } from '../domain/session.ts';
import type { UserAccount } from '../domain/user.ts';
import { NotFoundError } from '../errors/app-error.ts';
import type { UnitOfWork } from '../repositories/unit-of-work.ts';

export interface RetentionConfig {
  AUDIT_LOG_RETENTION_DAYS: number;
  INACTIVE_EMPLOYEE_RETENTION_DAYS: number;
}

export interface PersonalDataExport {
  exportedAt: string;
  formatVersion: 1;
  profile: Employee;
  account: UserAccount | null;
  activeSessions: Session[];
  recentActivity: AuditRecord[];
}

export interface RetentionResult {
  employeesAnonymised: number;
  auditLogsDeleted: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPORT_ACTIVITY_LIMIT = 100;

/** Data-subject rights and retention (assignment §5). See docs/privacy.md. */
export class PrivacyService {
  private readonly uow: UnitOfWork;
  private readonly config: RetentionConfig;

  constructor(uow: UnitOfWork, config: RetentionConfig) {
    this.uow = uow;
    this.config = config;
  }

  /** Right of access / portability: everything we hold about the caller, as JSON. */
  async exportOwnData(actor: Actor): Promise<PersonalDataExport> {
    if (actor.employeeId === null) throw new NotFoundError('Profile');
    const repos = this.uow.repositories;
    const profile = await repos.employees.findById(actor.employeeId);
    if (!profile) throw new NotFoundError('Profile');

    const result: PersonalDataExport = {
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
      profile,
      account: await repos.users.findById(actor.userId),
      activeSessions: await repos.sessions.listActiveForUser(actor.userId, new Date()),
      recentActivity: await repos.auditLogs.listByActor(actor.userId, EXPORT_ACTIVITY_LIMIT),
    };
    await repos.auditLogs.record({
      actorUserId: actor.userId,
      action: 'profile.export',
      resourceType: 'employee',
      resourceId: actor.employeeId,
      requestId: actor.requestId,
    });
    return result;
  }

  /**
   * The retention job (`npm run retention:run`, schedule it daily):
   * 1. employees deactivated longer than INACTIVE_EMPLOYEE_RETENTION_DAYS are anonymised and
   *    their login account deleted (each in its own transaction, with an audit entry);
   * 2. audit entries older than AUDIT_LOG_RETENTION_DAYS are deleted.
   */
  async runRetention(now = new Date()): Promise<RetentionResult> {
    const employeeCutoff = new Date(now.getTime() - this.config.INACTIVE_EMPLOYEE_RETENTION_DAYS * DAY_MS);
    const auditCutoff = new Date(now.getTime() - this.config.AUDIT_LOG_RETENTION_DAYS * DAY_MS);

    const ids = await this.uow.repositories.employees.findIdsDueForAnonymisation(employeeCutoff);
    for (const id of ids) {
      await this.uow.transaction(async (tx) => {
        await tx.users.deleteByEmployeeId(id); // sessions and refresh tokens cascade
        await tx.employees.anonymise(id, now);
        await tx.auditLogs.record({
          actorUserId: null,
          action: 'employee.anonymise',
          resourceType: 'employee',
          resourceId: id,
          requestId: null,
          metadata: { reason: 'retention_period_expired' },
        });
      });
    }

    const auditLogsDeleted = await this.uow.repositories.auditLogs.deleteOlderThan(auditCutoff);
    return { employeesAnonymised: ids.length, auditLogsDeleted };
  }
}
