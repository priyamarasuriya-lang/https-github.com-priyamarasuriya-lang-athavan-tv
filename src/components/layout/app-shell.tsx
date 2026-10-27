'use client';

import {
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarClock,
  Clapperboard,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  ScrollText,
  Settings,
  Sparkles,
  Timer,
  Tv,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { cx } from '@/components/ui/primitives';
import { api } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/client/format';
import type { NavItem } from './nav';

const ICONS: Record<string, LucideIcon> = { LayoutDashboard, CalendarClock, Tv, Clapperboard, Radio, Megaphone, Sparkles, FolderOpen, Timer, MonitorPlay, BadgeCheck, BarChart3, Users, ScrollText, Settings };

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function AppShell({ user, nav, children }: { user: { name: string; email: string; roles: string[] }; nav: NavItem[]; children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('bat.sidebar') === 'collapsed');
    } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [path]);
  useEffect(() => {
    const load = () => api<Notification[]>('/api/notifications').then(setNotes).catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('bat.sidebar', c ? 'open' : 'collapsed');
      } catch {}
      return !c;
    });
  };
  const unread = notes.filter((n) => !n.readAt).length;
  const logout = async () => {
    await api('/api/auth/logout', { body: {} }).catch(() => undefined);
    window.location.assign('/login');
  };

  const sidebar = (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-2">
      {nav.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = path === item.href || path.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            className={cx(
              'group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
              active ? 'bg-white/10 font-semibold text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
            )}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded" style={{ background: active ? item.accent : 'transparent' }}>
              <Icon className={cx('size-4', active ? 'text-navy-950' : '')} aria-hidden />
            </span>
            <span className={cx(collapsed && 'lg:sr-only')}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <aside className={cx('hidden shrink-0 flex-col bg-navy-900 transition-[width] lg:flex', collapsed ? 'w-16' : 'w-64')}>
          <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-coral-500 text-sm font-bold text-white">B</span>
            {!collapsed && <span className="text-lg font-light tracking-wide text-white">bats · scheduling</span>}
          </div>
          <div className="flex-1 overflow-y-auto">{sidebar}</div>
          <button type="button" onClick={toggle} className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs text-slate-400 hover:text-white" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-navy-900">{sidebar}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
            <button type="button" className="rounded p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </button>
            <div className="flex-1 text-xs uppercase tracking-[0.2em] text-muted">BAT Television · Traffic & Scheduling</div>
            <div className="relative">
              <button type="button" className="relative rounded-full p-2 hover:bg-slate-100" aria-label={`Notifications (${unread} unread)`} onClick={() => setShowNotes((s) => !s)} aria-expanded={showNotes}>
                <Bell className="size-5 text-navy-800" />
                {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
              </button>
              {showNotes && (
                <div className="absolute right-0 mt-2 w-80 rounded-lg bg-white shadow-xl ring-1 ring-line">
                  <div className="flex items-center justify-between border-b border-line px-3 py-2">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unread > 0 && (
                      <button
                        type="button"
                        className="text-xs text-teal-700 hover:underline"
                        onClick={async () => {
                          await api('/api/notifications', { body: {} });
                          setNotes((n) => n.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <ul className="max-h-80 overflow-y-auto">
                    {notes.length === 0 && <li className="px-3 py-4 text-sm text-muted">No notifications.</li>}
                    {notes.map((n) => (
                      <li key={n.id} className={cx('border-b border-line/60 px-3 py-2 text-sm', !n.readAt && 'bg-teal-50/60')}>
                        <a href={n.link ?? '#'} className="block hover:underline">
                          <span className="font-medium text-navy-900">{n.title}</span>
                          {n.body && <span className="block text-xs text-muted">{n.body}</span>}
                          <span className="block text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-navy-900">{user.name}</div>
              <div className="text-[11px] text-muted">{user.roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ')}</div>
            </div>
            <button type="button" onClick={logout} className="rounded-md p-2 text-navy-800 hover:bg-slate-100" aria-label="Sign out" title="Sign out">
              <LogOut className="size-5" />
            </button>
          </header>
          <main id="main" className="flex-1 p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
