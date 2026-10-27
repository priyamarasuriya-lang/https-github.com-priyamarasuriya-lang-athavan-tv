import { notFound } from 'next/navigation';
import { Forbidden } from '@/components/layout/forbidden';
import { ScheduleEditor } from '@/components/schedule/editor';
import { AppError } from '@/server/errors';
import { pageActor } from '@/server/auth/page-guard';
import { getScheduleView } from '@/server/services/schedules';

export const metadata = { title: 'Schedule' };

export default async function SchedulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const { actor, allowed } = await pageActor('schedule.view');
  if (!allowed) return <Forbidden what="schedules" />;
  const { id } = await params;
  const { version } = await searchParams;
  try {
    const view = await getScheduleView(actor, id, version ? Number(version) : undefined);
    return <ScheduleEditor key={`${view.id}-${view.versionNo}`} initial={view} currentUserId={actor.id} />;
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
}
