import { DateTime } from 'luxon';
import { BOOKING_POLICIES, CALENDAR_CONFIG } from './bookingConfig';

export type EventWindowResult =
  | { ok: true; localStart: DateTime; localEnd: DateTime }
  // `invalid` is a malformed request; `policy` is a well-formed date we do not accept.
  | { ok: false; reason: 'invalid' | 'policy'; message: string };

// Shared by check-availability and create-booking so a request sent straight to
// either endpoint is held to the same rules as the booking form. Duration always
// comes from config, never the client, since it decides how many days get blocked.
export const validateEventWindow = (eventDate: string, eventTime: string): EventWindowResult => {
  if (!eventDate || !eventTime) {
    return { ok: false, reason: 'invalid', message: 'Event date and start time are required.' };
  }

  const localStart = DateTime.fromISO(`${eventDate}T${eventTime}`, {
    zone: CALENDAR_CONFIG.timezone,
  });
  if (!localStart.isValid) {
    return { ok: false, reason: 'invalid', message: 'Invalid date or time format.' };
  }

  const nowLocal = DateTime.now().setZone(CALENDAR_CONFIG.timezone);
  if (localStart <= nowLocal) {
    return { ok: false, reason: 'invalid', message: 'Please choose a future date and time.' };
  }

  const earliestDate = nowLocal.startOf('day').plus({ days: BOOKING_POLICIES.minNoticeDays });
  if (localStart < earliestDate) {
    return {
      ok: false,
      reason: 'policy',
      message: `We require at least ${BOOKING_POLICIES.minNoticeDays} days notice for new events.`,
    };
  }

  const startHour = localStart.hour;
  if (startHour < BOOKING_POLICIES.serviceStartHour || startHour >= BOOKING_POLICIES.serviceEndHour) {
    return {
      ok: false,
      reason: 'policy',
      message: `Service start times must be between ${BOOKING_POLICIES.serviceStartHour}:00 and ${BOOKING_POLICIES.serviceEndHour - 1}:59.`,
    };
  }

  return {
    ok: true,
    localStart,
    localEnd: localStart.plus({ hours: BOOKING_POLICIES.defaultDurationHours }),
  };
};
