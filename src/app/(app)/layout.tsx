import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { NAV } from '@/components/layout/nav';
import { getActor } from '@/server/auth/actor';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect('/login?expired=1');
  const nav = NAV.filter((n) => actor.permissions.has(n.permission));
  return (
    <AppShell user={{ name: actor.name, email: actor.email, roles: actor.roles }} nav={nav}>
      {children}
    </AppShell>
  );
}
