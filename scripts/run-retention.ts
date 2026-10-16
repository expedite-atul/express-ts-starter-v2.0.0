/**
 * `npm run retention:run` — applies the data-retention policy once:
 * anonymises employees deactivated longer than INACTIVE_EMPLOYEE_RETENTION_DAYS and deletes
 * audit entries older than AUDIT_LOG_RETENTION_DAYS. Schedule it daily (cron, a platform
 * scheduler, ...). Safe to run repeatedly.
 */
import { createDataSource } from '../src/config/database.ts';
import { env } from '../src/config/env.ts';
import { UnitOfWork } from '../src/repositories/unit-of-work.ts';
import { PrivacyService } from '../src/services/privacy.service.ts';

const dataSource = createDataSource(env);
await dataSource.initialize();
try {
  const result = await new PrivacyService(new UnitOfWork(dataSource), env).runRetention();
  console.log(
    `Retention complete: ${result.employeesAnonymised} employee(s) anonymised, ` +
      `${result.auditLogsDeleted} audit entr(ies) deleted.`,
  );
} finally {
  await dataSource.destroy();
}
