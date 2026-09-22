import type { APIRoute } from 'astro';
import { deleteEvent, listExpiredEvents, hasEventsCalendar, DELETE_GRACE_HOURS } from '../../../lib/events';
import { deleteImage } from '../../../lib/blob';
import { readEnv } from '../../../lib/env';

export const prerender = false;

const CRON_SECRET = readEnv(import.meta.env.CRON_SECRET, 'CRON_SECRET');

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Removes events that finished more than DELETE_GRACE_HOURS ago, and their
 * images. This is the only destructive job in the app, so it is deliberately
 * conservative: the public pages already hide anything past, and this runs well
 * after the fact so a bad cutoff can never take out a live event.
 */
export const GET: APIRoute = async ({ request }) => {
  // Vercel Cron sends the secret as a bearer token.
  const auth = request.headers.get('authorization');
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return json({ success: false, message: 'Not authorised.' }, 401);
  }

  if (!hasEventsCalendar()) {
    return json({ success: false, message: 'Events calendar is not configured.' }, 503);
  }

  try {
    const expired = await listExpiredEvents();
    const removed: string[] = [];
    const failed: string[] = [];

    for (const event of expired) {
      try {
        await deleteEvent(event.id);
        if (event.imagePath) {
          await deleteImage(event.imagePath);
        }
        removed.push(`${event.title} (ended ${event.end})`);
      } catch (error) {
        console.error('Cleanup failed for event', event.id, error);
        failed.push(event.id);
      }
    }

    if (removed.length) {
      console.log(`Cleanup removed ${removed.length} event(s) older than ${DELETE_GRACE_HOURS}h:`, removed);
    }

    return json({ success: true, removed: removed.length, failed: failed.length, graceHours: DELETE_GRACE_HOURS });
  } catch (error) {
    console.error('Event cleanup failed:', error);
    return json({ success: false, message: 'Cleanup failed.' }, 502);
  }
};
