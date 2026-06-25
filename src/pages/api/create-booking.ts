import type { APIRoute } from 'astro';
import { BOOKING_POLICIES } from '../../lib/bookingConfig';
import { checkRangeAvailability, createBookingEvent } from '../../lib/googleCalendar';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

const requiredFields = [
  'event-date',
  'event-time',
  'event-type',
  'guest-count',
  'venue-location',
  'package',
  'full-name',
  'email',
  'phone',
] as const;

const buildDateTime = (date: string, time: string): Date => {
  return new Date(`${date}T${time}:00`);
};

const generateRequestId = (): string => {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `WF-${stamp}-${random}`;
};

export const POST: APIRoute = async ({ request }) => {
  let payload: Record<string, unknown>;

  try {
    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return json({ success: false, message: 'Request body is required.' }, 400);
    }

    // Remove UTF-8 BOM if present to avoid JSON parse issues across clients.
    const normalizedBody = rawBody.replace(/^\uFEFF/, '');
    payload = JSON.parse(normalizedBody) as Record<string, unknown>;
  } catch {
    return json({ success: false, message: 'Invalid JSON body.' }, 400);
  }

  for (const field of requiredFields) {
    if (!payload[field]) {
      return json({ success: false, message: `Missing required field: ${field}` }, 400);
    }
  }

  const eventDate = String(payload['event-date']);
  const eventTime = String(payload['event-time']);
  const durationHours = Number(payload.durationHours ?? BOOKING_POLICIES.defaultDurationHours);

  const start = buildDateTime(eventDate, eventTime);
  if (Number.isNaN(start.getTime())) {
    return json({ success: false, message: 'Invalid event date or time.' }, 400);
  }

  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const bufferedStart = new Date(start.getTime() - BOOKING_POLICIES.bufferHours * 60 * 60 * 1000);
  const bufferedEnd = new Date(end.getTime() + BOOKING_POLICIES.bufferHours * 60 * 60 * 1000);

  try {
    const availability = await checkRangeAvailability(bufferedStart, bufferedEnd);
    if (!availability.available) {
      return json(
        {
          success: false,
          message: 'That date is no longer available. Please choose a different time.',
        },
        409,
      );
    }

    const requestId = generateRequestId();

    const eventResult = await createBookingEvent({
      requestId,
      fullName: String(payload['full-name']),
      email: String(payload.email),
      phone: String(payload.phone),
      eventType: String(payload['event-type']),
      guestCount: Number(payload['guest-count']),
      venueLocation: String(payload['venue-location']),
      packageName: String(payload.package),
      preferredContact: String(payload['preferred-contact'] ?? 'email'),
      additionalNotes: String(payload['additional-notes'] ?? ''),
      dietary: {
        vegetarian: Boolean(payload['dietary-vegetarian']),
        vegan: Boolean(payload['dietary-vegan']),
        glutenFree: Boolean(payload['dietary-gluten-free']),
      },
      start,
      end,
    });

    return json({
      success: true,
      requestId,
      mode: eventResult.mode,
      eventId: eventResult.eventId,
      eventLink: eventResult.htmlLink,
      message:
        eventResult.mode === 'live'
          ? 'Booking request submitted. We will follow up within 24 hours with your quote and confirmation details.'
          : 'Booking request captured in safe mode. Add Google Calendar credentials to enable live calendar event creation.',
    });
  } catch (error) {
    console.error('Booking creation failed:', error);
    return json(
      {
        success: false,
        message: 'Something went wrong while creating your booking. Please try again.',
      },
      500,
    );
  }
};

export const GET: APIRoute = () => {
  return json({ success: false, message: 'Method not allowed.' }, 405);
};
