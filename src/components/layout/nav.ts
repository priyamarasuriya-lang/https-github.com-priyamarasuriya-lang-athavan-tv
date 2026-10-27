import type { Permission } from '@/server/auth/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
  accent: string;
}

/** Main navigation; entries are hidden when the user lacks the permission (the server enforces it regardless). */
export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard', permission: 'schedule.view', accent: '#2fc0ab' },
  { href: '/schedules', label: 'Broadcast Schedule', icon: 'CalendarClock', permission: 'schedule.view', accent: '#f5c343' },
  { href: '/programs', label: 'Programs', icon: 'Tv', permission: 'content.view', accent: '#f5c343' },
  { href: '/movies', label: 'Movies & Films', icon: 'Clapperboard', permission: 'content.view', accent: '#4cd5c2' },
  { href: '/news-events', label: 'News & Special Events', icon: 'Radio', permission: 'content.view', accent: '#3aa6df' },
  { href: '/advertisements', label: 'Advertisements', icon: 'Megaphone', permission: 'ads.view', accent: '#fb923c' },
  { href: '/promotions', label: 'Promotions & Fillers', icon: 'Sparkles', permission: 'content.view', accent: '#e6a935' },
  { href: '/media-library', label: 'Media Library', icon: 'FolderOpen', permission: 'content.view', accent: '#7fd3f7' },
  { href: '/timers-breaks', label: 'Timers & Breaks', icon: 'Timer', permission: 'ads.view', accent: '#94a3b8' },
  { href: '/channels', label: 'Channels & Playout', icon: 'MonitorPlay', permission: 'schedule.view', accent: '#2f3e55' },
  { href: '/approvals', label: 'Schedule Approvals', icon: 'BadgeCheck', permission: 'schedule.view', accent: '#2fc0ab' },
  { href: '/reports', label: 'Reports & Analytics', icon: 'BarChart3', permission: 'reports.view', accent: '#3aa6df' },
  { href: '/users', label: 'User Management', icon: 'Users', permission: 'users.manage', accent: '#f2604b' },
  { href: '/audit', label: 'Audit Logs', icon: 'ScrollText', permission: 'audit.view', accent: '#566a8c' },
  { href: '/settings', label: 'System Settings', icon: 'Settings', permission: 'settings.manage', accent: '#566a8c' },
];
