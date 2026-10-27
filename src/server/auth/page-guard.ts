import { redirect } from 'next/navigation';
import { getActor, type Actor } from './actor';
import type { Permission } from './permissions';

/** For server pages: returns the actor, redirects when signed out, or null when the permission is missing. */
export async function pageActor(permission: Permission): Promise<{ actor: Actor; allowed: boolean }> {
  const actor = await getActor();
  if (!actor) redirect('/login?expired=1');
  return { actor, allowed: actor.permissions.has(permission) };
}
