import type { APIRoute } from 'astro';
import { DateTime } from 'luxon';
import { BOOKING_POLICIES, CALENDAR_CONFIG } from '../../lib/bookingConfig';
import { checkRangeAvailability } from '../../lib/googleCalendar';

export const prerender = false;

const badRequest = (message: string, status = 400) => {
  return new Response(JSON.stringify({ available: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

  const localStart = DateTime.fromISO(`${eventDate}T${eventTime}`, {
    zone: CALENDAR_CONFIG.timezone,
  });
  if (!localStart.isValid) {
    return badRequest('Invalid date or time format.');
  }

  const nowLocal = DateTime.now().setZone(CALENDAR_CONFIG.timezone);
  if (localStart <= nowLocal) {
    return badRequest('Please choose a future date and time.');
  }

  const earliestDate = nowLocal.startOf('day').plus({ days: BOOKING_POLICIES.minNoticeDays });

  if (localStart < earliestDate) {
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

  const startHour = localStart.hour;
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

  const localEnd = localStart.plus({ hours: durationHours });
  const bufferedStart = localStart.minus({ hours: BOOKING_POLICIES.bufferHours }).toUTC().toJSDate();
  const bufferedEnd = localEnd.plus({ hours: BOOKING_POLICIES.bufferHours }).toUTC().toJSDate();

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
