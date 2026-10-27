'use client';

import { Loader2, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CATEGORY_STYLE, STATUS_STYLE } from '@/lib/categories';
import { CATEGORY_LABELS, type ContentCategory } from '@/lib/dto';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800 disabled:bg-navy-600',
  accent: 'bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-400',
  secondary: 'bg-white text-navy-900 ring-1 ring-line hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-navy-800 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-coral-600 text-white hover:bg-coral-500 disabled:bg-coral-400',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }>(
  function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        className={cx(
          'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
          size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
          VARIANTS[variant],
          className,
        )}
        {...rest}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('h-9 w-full rounded-md border border-line bg-white px-2.5 text-sm placeholder:text-slate-400 disabled:bg-slate-50', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx('h-9 w-full rounded-md border border-line bg-white px-2 text-sm disabled:bg-slate-50', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('min-h-20 w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm', className)} {...rest} />;
});

/** Label + control + hint/error, wired with ids for screen readers. */
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode; className?: string }) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-navy-700">
        {label}
      </label>
      {children(id, descId)}
      {(hint || error) && (
        <p id={descId} className={cx('text-xs', error ? 'text-coral-600' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Card({ title, actions, children, className, accent }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; accent?: string }) {
  return (
    <section className={cx('rounded-xl bg-white shadow-sm ring-1 ring-line', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-navy-900">
            {accent && <span className="h-4 w-1 rounded-full" style={{ background: accent }} aria-hidden />}
            {title}
          </h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1', STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT)}>{status.toLowerCase()}</span>;
}

export function CategoryChip({ category, short }: { category: ContentCategory | 'BREAK'; short?: boolean }) {
  const s = CATEGORY_STYLE[category];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-navy-800">
      <span className="size-2.5 rounded-sm ring-1 ring-black/10" style={{ background: s.dot }} aria-hidden />
      {!short && CATEGORY_LABELS[category]}
    </span>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children, className }: { tone?: 'info' | 'error' | 'warning' | 'success'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    error: 'bg-red-50 text-red-800 ring-red-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    success: 'bg-teal-50 text-teal-900 ring-teal-200',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-md px-3 py-2 text-sm ring-1', tones[tone], className)}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

/** Accessible modal on the native <dialog> element (focus trap and Esc handling come from the browser). */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={`${title}-title`}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-xl p-0 shadow-2xl ring-1 ring-line', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 id={`${title}-title`} className="text-base font-semibold text-navy-900">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close dialog">
              <X className="size-4" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line bg-slate-50 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="flex items-center justify-between pt-3 text-xs text-muted" aria-label="Pagination">
      <span>
        {total === 0 ? 'No records' : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total}`}
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="px-2 py-1.5">
          Page {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}

export function PageHeader({ title, subtitle, actions, crumbs }: { title: string; subtitle?: ReactNode; actions?: ReactNode; crumbs?: Array<{ href?: string; label: string }> }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-muted">
            <ol className="flex items-center gap-1">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden>/</span>}
                  {c.href ? (
                    <a href={c.href} className="hover:text-navy-900 hover:underline">
                      {c.label}
                    </a>
                  ) : (
                    <span aria-current="page">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cx('border-b border-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted', className)}>
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('border-b border-line/70 px-3 py-2 align-top', className)}>{children}</td>;
