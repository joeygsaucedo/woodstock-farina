import type { APIRoute } from 'astro';
import { validateEventWindow } from '../../lib/bookingRules';
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

  const eventWindow = validateEventWindow(String(body.eventDate ?? ''), String(body.eventTime ?? ''));
  if (!eventWindow.ok) {
    if (eventWindow.reason === 'invalid') {
      return badRequest(eventWindow.message);
    }

    return new Response(JSON.stringify({ available: false, message: eventWindow.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // A booking reserves the whole day, so availability is checked against every
  // calendar day the event touches rather than just the service window. A late
  // start can push the end past midnight, which blocks the following day too.
  const { localStart, localEnd } = eventWindow;
  const dayStart = localStart.startOf('day').toUTC().toJSDate();
  const dayEnd = localEnd.endOf('day').toUTC().toJSDate();

  try {
    const result = await checkRangeAvailability(dayStart, dayEnd);

    if (!result.available) {
      return new Response(
        JSON.stringify({
          available: false,
          mode: result.mode,
          message: 'We are already booked that day. Each event reserves the full day, so please choose another date.',
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
