import { ShieldAlert } from 'lucide-react';

export function Forbidden({ what = 'this page' }: { what?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-line">
      <ShieldAlert className="mx-auto size-10 text-coral-500" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-navy-900">Access restricted</h1>
      <p className="mt-1 text-sm text-muted">Your role does not include access to {what}. Ask an administrator if you need it.</p>
    </div>
  );
}
