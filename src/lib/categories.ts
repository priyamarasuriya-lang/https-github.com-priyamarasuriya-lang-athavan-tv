import type { ContentCategory } from './dto';

/** Category colours (reference tile palette) for timeline blocks, chips and legends. */
export const CATEGORY_STYLE: Record<ContentCategory | 'BREAK', { bg: string; fg: string; dot: string }> = {
  PROGRAM: { bg: 'bg-amber-300', fg: 'text-navy-950', dot: '#f5c343' },
  MOVIE: { bg: 'bg-teal-400', fg: 'text-navy-950', dot: '#4cd5c2' },
  NEWS: { bg: 'bg-sky-500', fg: 'text-white', dot: '#3aa6df' },
  LIVE: { bg: 'bg-coral-500', fg: 'text-white', dot: '#f2604b' },
  SPECIAL_EVENT: { bg: 'bg-violet-400', fg: 'text-navy-950', dot: '#a78bfa' },
  ADVERTISEMENT: { bg: 'bg-orange-400', fg: 'text-navy-950', dot: '#fb923c' },
  PROMO: { bg: 'bg-amber-400', fg: 'text-navy-950', dot: '#e6a935' },
  FILLER: { bg: 'bg-navy-800', fg: 'text-white', dot: '#2f3e55' },
  SLIDE: { bg: 'bg-yellow-200', fg: 'text-navy-950', dot: '#fde68a' },
  STATION_ID: { bg: 'bg-sky-300', fg: 'text-navy-950', dot: '#7fd3f7' },
  PSA: { bg: 'bg-emerald-400', fg: 'text-navy-950', dot: '#34d399' },
  BREAK: { bg: 'bg-slate-300', fg: 'text-navy-950', dot: '#94a3b8' },
};

export const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-300',
  SUBMITTED: 'bg-amber-50 text-amber-800 ring-amber-300',
  APPROVED: 'bg-sky-50 text-sky-800 ring-sky-300',
  PUBLISHED: 'bg-teal-50 text-teal-800 ring-teal-400',
  ARCHIVED: 'bg-slate-50 text-slate-500 ring-slate-200',
  ACTIVE: 'bg-teal-50 text-teal-800 ring-teal-400',
  PAUSED: 'bg-amber-50 text-amber-800 ring-amber-300',
  COMPLETED: 'bg-slate-100 text-slate-700 ring-slate-300',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-200',
  PENDING: 'bg-amber-50 text-amber-800 ring-amber-300',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
  WITHDRAWN: 'bg-slate-50 text-slate-500 ring-slate-200',
};
