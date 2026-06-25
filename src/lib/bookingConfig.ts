const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const BOOKING_POLICIES = {
  minNoticeDays: parseNumber(import.meta.env.BOOKING_MIN_NOTICE_DAYS, 7),
  defaultDurationHours: parseNumber(import.meta.env.BOOKING_DEFAULT_DURATION_HOURS, 3),
  serviceStartHour: parseNumber(import.meta.env.BOOKING_SERVICE_START_HOUR, 10),
  serviceEndHour: parseNumber(import.meta.env.BOOKING_SERVICE_END_HOUR, 21),
  bufferHours: parseNumber(import.meta.env.BOOKING_BUFFER_HOURS, 3),
};

export const CALENDAR_CONFIG = {
  calendarId: import.meta.env.BOOKING_CALENDAR_ID ?? import.meta.env.GOOGLE_CALENDAR_ID,
  serviceAccountEmail: import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  privateKey: import.meta.env.GOOGLE_PRIVATE_KEY,
  timezone: import.meta.env.BOOKING_TIMEZONE ?? 'America/Los_Angeles',
};

export const hasCalendarCredentials = (): boolean => {
  return Boolean(
    CALENDAR_CONFIG.calendarId &&
      CALENDAR_CONFIG.serviceAccountEmail &&
      CALENDAR_CONFIG.privateKey,
  );
};
