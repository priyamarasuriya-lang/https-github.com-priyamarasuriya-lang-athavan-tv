import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/actor';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

const TILES = [
  { label: 'Programs', className: 'bg-amber-400 col-span-2' },
  { label: 'Timers', className: 'bg-slate-100 text-navy-800' },
  { label: 'Movies', className: 'bg-teal-400' },
  { label: 'Promos', className: 'bg-amber-300' },
  { label: 'Fillers', className: 'bg-navy-800 text-white' },
  { label: 'Slides', className: 'bg-yellow-200' },
  { label: 'Coming up', className: 'bg-coral-400 text-white col-span-2' },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  if (await getActor()) redirect('/dashboard');
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/dashboard';
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-slate-100 to-slate-200 p-10 lg:flex" aria-hidden>
        <div className="flex items-center gap-2 text-navy-900">
          <span className="grid size-9 place-items-center rounded-lg bg-coral-500 text-sm font-bold text-white">B</span>
          <span className="text-xl font-light tracking-wide">bats</span>
        </div>
        <div className="grid max-w-md grid-cols-4 gap-3">
          {TILES.map((t) => (
            <div key={t.label} className={`flex h-24 items-end rounded-sm p-3 text-lg font-semibold text-navy-950 shadow-md ${t.className}`}>
              {t.label}
            </div>
          ))}
        </div>
        <p className="text-4xl font-light tracking-tight text-navy-800">Scheduling</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-navy-900">Sign in to BAT Scheduling</h1>
          <p className="mt-1 text-sm text-muted">Broadcast scheduling, approvals and traffic.</p>
          <LoginForm next={next} expired={sp.expired === '1'} />
        </div>
      </div>
    </main>
  );
}
