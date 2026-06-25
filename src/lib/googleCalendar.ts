import { google, type calendar_v3 } from 'googleapis';
import { CALENDAR_CONFIG, hasCalendarCredentials } from './bookingConfig';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const getCalendarClient = (): calendar_v3.Calendar | null => {
  if (!hasCalendarCredentials()) {
    return null;
  }

  const privateKey = CALENDAR_CONFIG.privateKey?.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT(
    CALENDAR_CONFIG.serviceAccountEmail,
    undefined,
    privateKey,
    SCOPES,
  );

  return google.calendar({ version: 'v3', auth });
};

export const checkRangeAvailability = async (
  start: Date,
  end: Date,
): Promise<{ available: boolean; mode: 'live' | 'mock' }> => {
  const calendar = getCalendarClient();
  const calendarId = CALENDAR_CONFIG.calendarId;

  if (!calendar || !calendarId) {
    return { available: true, mode: 'mock' };
  }

  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: CALENDAR_CONFIG.timezone,
      items: [{ id: calendarId }],
    },
  });

  const busy = freeBusy.data.calendars?.[calendarId]?.busy ?? [];
  return { available: busy.length === 0, mode: 'live' };
};

interface BookingEventPayload {
  requestId: string;
  fullName: string;
  email: string;
  phone: string;
  eventType: string;
  guestCount: number;
  venueLocation: string;
  packageName: string;
  preferredContact: string;
  additionalNotes: string;
  dietary: {
    vegetarian: boolean;
    vegan: boolean;
    glutenFree: boolean;
  };
  start: Date;
  end: Date;
}

export const createBookingEvent = async (
  payload: BookingEventPayload,
): Promise<{ mode: 'live' | 'mock'; eventId: string; htmlLink?: string }> => {
  const calendar = getCalendarClient();
  const calendarId = CALENDAR_CONFIG.calendarId;

  if (!calendar || !calendarId) {
    return {
      mode: 'mock',
      eventId: `mock-${payload.requestId}`,
    };
  }

  const description = [
    `STATUS: Requested`,
    `REQUEST_ID: ${payload.requestId}`,
    '',
    'Customer Details',
    `Name: ${payload.fullName}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Preferred Contact: ${payload.preferredContact}`,
    '',
    'Event Details',
    `Type: ${payload.eventType}`,
    `Guests: ${payload.guestCount}`,
    `Package: ${payload.packageName}`,
    `Venue: ${payload.venueLocation}`,
    '',
    'Dietary',
    `Vegetarian: ${payload.dietary.vegetarian ? 'Yes' : 'No'}`,
    `Vegan: ${payload.dietary.vegan ? 'Yes' : 'No'}`,
    `Gluten Free: ${payload.dietary.glutenFree ? 'Yes' : 'No'}`,
    '',
    'Additional Notes',
    payload.additionalNotes || 'None provided',
  ].join('\n');

  const summary = `BOOKING REQUEST | ${payload.fullName} | ${payload.eventType} | ${payload.venueLocation}`;

  const result = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: {
        dateTime: payload.start.toISOString(),
        timeZone: CALENDAR_CONFIG.timezone,
      },
      end: {
        dateTime: payload.end.toISOString(),
        timeZone: CALENDAR_CONFIG.timezone,
      },
      colorId: '5',
    },
  });

  return {
    mode: 'live',
    eventId: result.data.id ?? payload.requestId,
    htmlLink: result.data.htmlLink ?? undefined,
  };
};
