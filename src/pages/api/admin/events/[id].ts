import type { APIRoute } from 'astro';
import { isAuthenticated, unauthorized } from '../../../../lib/adminAuth';
import { deleteEvent, getEvent, updateEvent, hasEventsCalendar } from '../../../../lib/events';
import { validate, toInput } from '../events';
import { deleteImage } from '../../../../lib/blob';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const PUT: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) return unauthorized();
  if (!hasEventsCalendar()) {
    return json({ success: false, message: 'Events calendar is not configured.' }, 503);
  }

  const id = params.id;
  if (!id) return json({ success: false, message: 'Missing event id.' }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ success: false, message: 'Invalid request.' }, 400);
  }

  const problem = validate(body);
  if (problem) return json({ success: false, message: problem }, 400);

  try {
    const existing = await getEvent(id);
    const next = toInput(body);
    const updated = await updateEvent(id, next);

    // A replaced image leaves the old blob orphaned, so remove it once the
    // event itself has been updated successfully.
    if (existing?.imagePath && existing.imagePath !== next.imagePath) {
      await deleteImage(existing.imagePath);
    }

    return json({ success: true, event: updated });
  } catch (error) {
    console.error('Updating event failed:', error);
    return json({ success: false, message: (error as Error).message || 'Could not update event.' }, 502);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!isAuthenticated(request)) return unauthorized();
  if (!hasEventsCalendar()) {
    return json({ success: false, message: 'Events calendar is not configured.' }, 503);
  }

  const id = params.id;
  if (!id) return json({ success: false, message: 'Missing event id.' }, 400);

  try {
    const existing = await getEvent(id);
    await deleteEvent(id);
    if (existing?.imagePath) {
      await deleteImage(existing.imagePath);
    }
    return json({ success: true });
  } catch (error) {
    console.error('Deleting event failed:', error);
    return json({ success: false, message: 'Could not delete event.' }, 502);
  }
};
