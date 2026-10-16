/**
 * Actions recorded in `audit_logs`. Audit entries name WHAT happened to WHICH record and
 * WHO did it. They never contain personal data values: `metadata` holds field names,
 * role names or reasons only.
 */
export const AUDIT_ACTIONS = [
  'employee.create',
  'employee.update',
  'employee.deactivate',
  'employee.anonymise',
  'profile.update',
  'profile.export',
  'department.create',
  'department.update',
  'user.role_change',
  'auth.password_change',
  'auth.logout_all',
  'session.revoke',
  'session.reuse_detected',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_RESOURCE_TYPES = ['employee', 'department', 'user', 'session'] as const;
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

export interface AuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  requestId: string | null;
  metadata?: Record<string, string | number | boolean | string[]>;
}

export interface AuditRecord extends AuditEntry {
  id: string;
  timestamp: Date;
}
