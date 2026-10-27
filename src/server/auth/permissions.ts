/** Permission catalogue and default role grants. Seeded into the database; enforced server-side. */

export const PERMISSIONS = {
  'schedule.view': 'View broadcast schedules',
  'schedule.edit': 'Create and edit draft schedules',
  'schedule.submit': 'Submit schedules for approval',
  'schedule.approve': 'Approve or reject submitted schedules',
  'schedule.publish': 'Publish approved schedules',
  'schedule.reopen': 'Reopen approved/published schedules as a new revision',
  'schedule.archive': 'Archive schedules',
  'content.view': 'View the content catalogue',
  'content.manage': 'Create, edit and archive content',
  'content.approve': 'Approve content for broadcast',
  'media.upload': 'Upload media assets',
  'ads.view': 'View advertisers, campaigns and breaks',
  'ads.manage': 'Manage advertisers, campaigns, creatives and breaks',
  'channel.manage': 'Manage channels, playout settings and scheduling rules',
  'reports.view': 'View reports',
  'reports.export': 'Export reports and schedules (PDF/XLSX/CSV)',
  'users.manage': 'Manage users and role assignments',
  'settings.manage': 'Change system settings',
  'audit.view': 'View audit logs',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLES: Record<string, { name: string; description: string; permissions: Permission[] }> = {
  SUPER_ADMIN: { name: 'Super Administrator', description: 'Unrestricted access, including administrator management.', permissions: ALL_PERMISSIONS },
  ADMIN: {
    name: 'Administrator',
    description: 'Manages users, channels and settings.',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'schedule.approve'),
  },
  CHIEF_SCHEDULER: {
    name: 'Chief Scheduler',
    description: 'Leads scheduling; can publish, reopen and archive.',
    permissions: ['schedule.view', 'schedule.edit', 'schedule.submit', 'schedule.publish', 'schedule.reopen', 'schedule.archive', 'content.view', 'ads.view', 'reports.view', 'reports.export', 'audit.view'],
  },
  SCHEDULER: {
    name: 'Scheduler',
    description: 'Builds and submits daily schedules.',
    permissions: ['schedule.view', 'schedule.edit', 'schedule.submit', 'content.view', 'ads.view', 'reports.view', 'reports.export'],
  },
  CONTENT_MANAGER: {
    name: 'Content Manager',
    description: 'Maintains the content catalogue and media.',
    permissions: ['content.view', 'content.manage', 'content.approve', 'media.upload', 'schedule.view', 'reports.view'],
  },
  AD_MANAGER: {
    name: 'Advertising Manager',
    description: 'Manages advertisers, campaigns and commercial breaks.',
    permissions: ['ads.view', 'ads.manage', 'content.view', 'media.upload', 'schedule.view', 'reports.view', 'reports.export'],
  },
  APPROVER: {
    name: 'Approver',
    description: 'Reviews, approves and publishes schedules.',
    permissions: ['schedule.view', 'schedule.approve', 'schedule.publish', 'content.view', 'ads.view', 'reports.view', 'reports.export', 'audit.view'],
  },
  REPORTS_VIEWER: { name: 'Reports Viewer', description: 'Read-only access to schedules and reports.', permissions: ['schedule.view', 'reports.view', 'reports.export'] },
};

export function hasPermission(granted: ReadonlySet<string> | readonly string[], required: Permission): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(required);
}

export function hasAll(granted: ReadonlySet<string>, required: Permission[]): boolean {
  return required.every((p) => granted.has(p));
}
