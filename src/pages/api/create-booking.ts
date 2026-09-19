import type { APIRoute } from 'astro';
import { DateTime } from 'luxon';
import { BOOKING_POLICIES, CALENDAR_CONFIG } from '../../lib/bookingConfig';
import { checkRangeAvailability, createBookingEvent } from '../../lib/googleCalendar';
import {
  EMAIL_CONFIG,
  hasEmailConfig,
  isValidEmail,
  missingEmailConfig,
  sendEmail,
  type SendEmailResult,
} from '../../lib/email';
import { createRateLimiter, getClientKey } from '../../lib/rateLimit';

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

// Each accepted request writes a calendar event and sends two emails, and one
// event blocks the whole day, so an unthrottled endpoint could blank out the
// booking calendar. Generous enough for a real customer retrying.
const isRateLimited = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

// Everything here lands in a calendar event and two emails, so cap the inputs.
const fieldLimits: Record<string, number> = {
  'full-name': 100,
  email: 254,
  phone: 40,
  'event-type': 60,
  'venue-location': 300,
  package: 80,
  'preferred-contact': 20,
  'additional-notes': 2000,
};

const MAX_GUESTS = 2000;

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

  for (const [field, limit] of Object.entries(fieldLimits)) {
    if (String(payload[field] ?? '').length > limit) {
      return json(
        { success: false, message: `${field} is too long (maximum ${limit} characters).` },
        400,
      );
    }
  }

  if (!isValidEmail(String(payload.email).trim())) {
    return json({ success: false, message: 'Please enter a valid email address.' }, 400);
  }

  const parsedGuests = Number(payload['guest-count']);
  if (!Number.isFinite(parsedGuests) || parsedGuests < 1 || parsedGuests > MAX_GUESTS) {
    return json({ success: false, message: 'Please enter a valid guest count.' }, 400);
  }

  if (isRateLimited(getClientKey(request))) {
    return json(
      {
        success: false,
        message:
          "We've received several requests from you already. Please give us a little time, or call (661) 754-6510.",
      },
      429,
    );
  }

  const eventDate = String(payload['event-date']);
  const eventTime = String(payload['event-time']);
  const durationHours = Number(payload.durationHours ?? BOOKING_POLICIES.defaultDurationHours);

  const localStart = DateTime.fromISO(`${eventDate}T${eventTime}`, {
    zone: CALENDAR_CONFIG.timezone,
  });
  if (!localStart.isValid) {
    return json({ success: false, message: 'Invalid event date or time.' }, 400);
  }

  const start = localStart.toUTC().toJSDate();
  const end = localStart.plus({ hours: durationHours }).toUTC().toJSDate();

  // Matches check-availability: a booking reserves every calendar day it touches.
  const dayStart = localStart.startOf('day').toUTC().toJSDate();
  const dayEnd = localStart.plus({ hours: durationHours }).endOf('day').toUTC().toJSDate();

  try {
    const availability = await checkRangeAvailability(dayStart, dayEnd);
    if (!availability.available) {
      return json(
        {
          success: false,
          message: 'That date is no longer available. Each event reserves the full day, so please choose another date.',
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

    const guestName = String(payload['full-name']);
    const guestEmail = String(payload.email);
    const guestPhone = String(payload.phone);
    const eventType = String(payload['event-type']);
    const guestCount = String(payload['guest-count']);
    const venueLocation = String(payload['venue-location']);
    const packageName = String(payload.package);
    const preferredContact = String(payload['preferred-contact'] ?? 'email');
    const additionalNotes = String(payload['additional-notes'] ?? '');

    const localEnd = localStart.plus({ hours: durationHours });
    const formattedDate = localStart.toFormat('EEEE, LLLL d, yyyy');
    const formattedTimeRange = `${localStart.toFormat('h:mm a')} - ${localEnd.toFormat('h:mm a')} (${CALENDAR_CONFIG.timezone})`;

    const dietaryText = [
      `Vegetarian: ${Boolean(payload['dietary-vegetarian']) ? 'Yes' : 'No'}`,
      `Vegan: ${Boolean(payload['dietary-vegan']) ? 'Yes' : 'No'}`,
      `Gluten Free: ${Boolean(payload['dietary-gluten-free']) ? 'Yes' : 'No'}`,
    ].join(', ');

    const bookingNotificationText = [
      'New booking request received.',
      '',
      `Request ID: ${requestId}`,
      `Name: ${guestName}`,
      `Email: ${guestEmail}`,
      `Phone: ${guestPhone}`,
      `Preferred Contact: ${preferredContact}`,
      '',
      `Event Type: ${eventType}`,
      `Date: ${formattedDate}`,
      `Time: ${formattedTimeRange}`,
      `Guest Count: ${guestCount}`,
      `Venue/Location: ${venueLocation}${payload['venue-location-id'] ? ' (verified address)' : ' (typed by guest, not verified)'}`,
      `Package: ${packageName}`,
      `Dietary: ${dietaryText}`,
      '',
      'Additional Notes:',
      additionalNotes || 'None provided',
      '',
      `Calendar Mode: ${eventResult.mode}`,
      `Calendar Event ID: ${eventResult.eventId}`,
      eventResult.htmlLink ? `Calendar Link: ${eventResult.htmlLink}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const customerConfirmationText = [
      `Hi ${guestName},`,
      '',
      'Thanks for reaching out to Woodstock Farina. We received your booking request and will get back to you within 2-3 business days with your quote and confirmation details.',
      '',
      `Request ID: ${requestId}`,
      `Event: ${eventType}`,
      `Date: ${formattedDate}`,
      `Time: ${formattedTimeRange}`,
      `Guests: ${guestCount}`,
      `Venue: ${venueLocation}`,
      '',
      'If you need to add details or make changes, just reply to this email and include your request ID.',
      '',
      'Warmly,',
      'Woodstock Farina',
      '(661) 754-6510',
    ].join('\n');

    // Email must never sink a booking that is already on the calendar, so these
    // are settled independently and only logged. Sent in parallel to stay well
    // inside the 30s function budget.
    if (!hasEmailConfig()) {
      console.error(
        `Booking ${requestId} created but no email sent. Missing: ${missingEmailConfig().join(', ')}`,
      );
    }

    const [ownerNotification, guestConfirmation] = await Promise.allSettled([
      sendEmail({
        to: EMAIL_CONFIG.corporateEmailTo,
        subject: `New Booking Request - ${guestName} - ${formattedDate}`,
        text: bookingNotificationText,
        replyTo: guestEmail,
      }),
      sendEmail({
        to: guestEmail,
        subject: `We received your booking request (${requestId})`,
        text: customerConfirmationText,
        replyTo: EMAIL_CONFIG.corporateEmailTo,
      }),
    ]);

    const describeSend = (label: string, outcome: PromiseSettledResult<SendEmailResult>): boolean => {
      if (outcome.status === 'rejected') {
        console.error(`${label} email failed for ${requestId}:`, outcome.reason);
        return false;
      }

      if (!outcome.value.sent) {
        console.error(`${label} email not sent for ${requestId}: ${outcome.value.reason}`);
        return false;
      }

      return true;
    };

    const ownerNotified = describeSend('Booking notification', ownerNotification);
    const guestNotified = describeSend('Booking confirmation', guestConfirmation);

    return json({
      success: true,
      requestId,
      mode: eventResult.mode,
      eventId: eventResult.eventId,
      eventLink: eventResult.htmlLink,
      emailed: { owner: ownerNotified, guest: guestNotified },
      message:
        eventResult.mode === 'live'
          ? 'Booking request submitted. We will follow up within 2-3 business days with your quote and confirmation details.'
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
