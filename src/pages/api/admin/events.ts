import type { APIRoute } from 'astro';
import { DateTime } from 'luxon';
import { CALENDAR_CONFIG } from '../../../lib/bookingConfig';
import { isAuthenticated, unauthorized } from '../../../lib/adminAuth';
import { createEvent, listAdminEvents, hasEventsCalendar, type EventInput } from '../../../lib/events';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const LIMITS: Record<string, number> = {
  title: 120,
  description: 2000,
  location: 200,
};

/** Returns an error string, or null when the input is usable. */
export const validate = (body: Record<string, unknown>): string | null => {
  for (const field of ['title', 'date', 'startTime', 'endTime'] as const) {
    if (!String(body[field] ?? '').trim()) {
      return `${field} is required.`;
    }
  }
  for (const [field, limit] of Object.entries(LIMITS)) {
    if (String(body[field] ?? '').length > limit) {
      return `${field} must be ${limit} characters or fewer.`;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) {
    return 'Date must be in yyyy-mm-dd format.';
  }
  for (const field of ['startTime', 'endTime'] as const) {
    if (!/^\d{2}:\d{2}$/.test(String(body[field]))) {
      return `${field} must be in HH:mm format.`;
    }
  }

  // Parse properly so 25:99 and 2026-02-31 are rejected here as bad input,
  // rather than surfacing later as a server error.
  const start = DateTime.fromISO(`${String(body.date)}T${String(body.startTime)}`, {
    zone: CALENDAR_CONFIG.timezone,
  });
  const end = DateTime.fromISO(`${String(body.date)}T${String(body.endTime)}`, {
    zone: CALENDAR_CONFIG.timezone,
  });

  if (!start.isValid || !end.isValid) {
    return 'That date and time combination is not valid.';
  }
  if (end <= start) {
    return 'End time must be after the start time.';
  }

  return null;
};

export const toInput = (body: Record<string, unknown>): EventInput => ({
  title: String(body.title).trim(),
  description: String(body.description ?? '').trim(),
  location: String(body.location ?? '').trim(),
  date: String(body.date),
  startTime: String(body.startTime),
  endTime: String(body.endTime),
  imageUrl: String(body.imageUrl ?? '').trim() || undefined,
  imagePath: String(body.imagePath ?? '').trim() || undefined,
});

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) return unauthorized();
  if (!hasEventsCalendar()) {
    return json({ success: false, message: 'Events calendar is not configured.' }, 503);
  }

  try {
    return json({ success: true, events: await listAdminEvents() });
  } catch (error) {
    console.error('Listing events failed:', error);
    return json({ success: false, message: 'Could not load events.' }, 502);
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthenticated(request)) return unauthorized();
  if (!hasEventsCalendar()) {
    return json({ success: false, message: 'Events calendar is not configured.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ success: false, message: 'Invalid request.' }, 400);
  }

  const problem = validate(body);
  if (problem) {
    return json({ success: false, message: problem }, 400);
  }

  try {
    return json({ success: true, event: await createEvent(toInput(body)) }, 201);
  } catch (error) {
    console.error('Creating event failed:', error);
    return json({ success: false, message: (error as Error).message || 'Could not create event.' }, 502);
  }
};
