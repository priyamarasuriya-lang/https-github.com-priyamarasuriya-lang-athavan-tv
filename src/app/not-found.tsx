import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto mt-24 max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-line">
      <h1 className="text-lg font-semibold text-navy-900">Not found</h1>
      <p className="mt-1 text-sm text-muted">That page or record does not exist.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-teal-700 hover:underline">
        Back to dashboard
      </Link>
    </main>
  );
}
