import type { APIRoute } from 'astro';
import { BOOKING_POLICIES } from '../../lib/bookingConfig';
import { checkRangeAvailability } from '../../lib/googleCalendar';

export const prerender = false;

const badRequest = (message: string, status = 400) => {
  return new Response(JSON.stringify({ available: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

const buildDateTime = (date: string, time: string): Date => {
  return new Date(`${date}T${time}:00`);
};

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;

  try {
    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return badRequest('Request body is required.');
    }

    // Remove UTF-8 BOM if present to avoid JSON parse issues across clients.
    const normalizedBody = rawBody.replace(/^\uFEFF/, '');
    body = JSON.parse(normalizedBody) as Record<string, unknown>;
  } catch {
    return badRequest('Invalid JSON body.');
  }

  const eventDate = String(body.eventDate ?? '');
  const eventTime = String(body.eventTime ?? '');
  const durationHours = Number(body.durationHours ?? BOOKING_POLICIES.defaultDurationHours);

  if (!eventDate || !eventTime) {
    return badRequest('Event date and start time are required.');
  }

  const start = buildDateTime(eventDate, eventTime);
  if (Number.isNaN(start.getTime())) {
    return badRequest('Invalid date or time format.');
  }

  const now = new Date();
  if (start.getTime() <= now.getTime()) {
    return badRequest('Please choose a future date and time.');
  }

  const earliestDate = new Date();
  earliestDate.setHours(0, 0, 0, 0);
  earliestDate.setDate(earliestDate.getDate() + BOOKING_POLICIES.minNoticeDays);

  if (start.getTime() < earliestDate.getTime()) {
    return new Response(
      JSON.stringify({
        available: false,
        message: `We require at least ${BOOKING_POLICIES.minNoticeDays} days notice for new events.`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const startHour = start.getHours();
  if (startHour < BOOKING_POLICIES.serviceStartHour || startHour >= BOOKING_POLICIES.serviceEndHour) {
    return new Response(
      JSON.stringify({
        available: false,
        message: `Service start times must be between ${BOOKING_POLICIES.serviceStartHour}:00 and ${BOOKING_POLICIES.serviceEndHour - 1}:59.`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const bufferedStart = new Date(start.getTime() - BOOKING_POLICIES.bufferHours * 60 * 60 * 1000);
  const bufferedEnd = new Date(end.getTime() + BOOKING_POLICIES.bufferHours * 60 * 60 * 1000);

  try {
    const result = await checkRangeAvailability(bufferedStart, bufferedEnd);

    if (!result.available) {
      return new Response(
        JSON.stringify({
          available: false,
          mode: result.mode,
          message: 'That time is currently unavailable. Please choose another date or time.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        available: true,
        mode: result.mode,
        message: 'Great news. That date and time are currently available.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Availability check failed:', error);
    return new Response(
      JSON.stringify({
        available: false,
        message: 'We could not verify live availability right now. Please try again.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};

export const GET: APIRoute = () => {
  return badRequest('Method not allowed.', 405);
};
