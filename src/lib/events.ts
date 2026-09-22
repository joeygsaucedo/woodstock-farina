import { DateTime } from 'luxon';
import { CALENDAR_CONFIG } from './bookingConfig';
import { getCalendarClient } from './googleCalendar';
import { readEnv } from './env';

export const EVENTS_CALENDAR_ID = readEnv(
  import.meta.env.EVENTS_CALENDAR_ID,
  'EVENTS_CALENDAR_ID',
);

/** Past events are removed by a scheduled job, but only well after they end. */
export const DELETE_GRACE_HOURS = 48;

export interface SiteEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  /** ISO strings in the events timezone. */
  start: string;
  end: string;
  imageUrl?: string;
  imagePath?: string;
}

export interface EventInput {
  title: string;
  description: string;
  location: string;
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  imageUrl?: string;
  imagePath?: string;
}

export const hasEventsCalendar = (): boolean =>
  Boolean(EVENTS_CALENDAR_ID && getCalendarClient());

const zone = () => CALENDAR_CONFIG.timezone;

const requireClient = () => {
  const client = getCalendarClient();
  if (!client || !EVENTS_CALENDAR_ID) {
    throw new Error('Events calendar is not configured.');
  }
  return { client, calendarId: EVENTS_CALENDAR_ID };
};

const toSiteEvent = (item: {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
}): SiteEvent | null => {
  const start = item.start?.dateTime ?? item.start?.date;
  const end = item.end?.dateTime ?? item.end?.date;
  if (!item.id || !start || !end) {
    return null;
  }

  return {
    id: item.id,
    title: item.summary ?? 'Untitled event',
    description: item.description ?? '',
    location: item.location ?? '',
    start,
    end,
    imageUrl: item.extendedProperties?.private?.imageUrl || undefined,
    imagePath: item.extendedProperties?.private?.imagePath || undefined,
  };
};

const toRequestBody = (input: EventInput) => {
  const start = DateTime.fromISO(`${input.date}T${input.startTime}`, { zone: zone() });
  const end = DateTime.fromISO(`${input.date}T${input.endTime}`, { zone: zone() });

  if (!start.isValid || !end.isValid) {
    throw new Error('Invalid date or time.');
  }
  if (end <= start) {
    throw new Error('End time must be after the start time.');
  }

  return {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: { dateTime: start.toISO(), timeZone: zone() },
    end: { dateTime: end.toISO(), timeZone: zone() },
    extendedProperties: {
      private: {
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        ...(input.imagePath ? { imagePath: input.imagePath } : {}),
      },
    },
  };
};

/**
 * Events still running or yet to start, soonest first. Filtering on the end
 * time means an event happening right now still shows.
 */
export const listUpcomingEvents = async (limit = 50): Promise<SiteEvent[]> => {
  const { client, calendarId } = requireClient();
  const res = await client.events.list({
    calendarId,
    timeMin: DateTime.now().setZone(zone()).toISO() ?? undefined,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: limit,
  });

  return (res.data.items ?? []).map(toSiteEvent).filter((e): e is SiteEvent => e !== null);
};

/** Everything the admin should see: upcoming plus anything not yet cleaned up. */
export const listAdminEvents = async (): Promise<SiteEvent[]> => {
  const { client, calendarId } = requireClient();
  const res = await client.events.list({
    calendarId,
    timeMin: DateTime.now().setZone(zone()).minus({ hours: DELETE_GRACE_HOURS }).toISO() ?? undefined,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  return (res.data.items ?? []).map(toSiteEvent).filter((e): e is SiteEvent => e !== null);
};

export const getEvent = async (id: string): Promise<SiteEvent | null> => {
  const { client, calendarId } = requireClient();
  const res = await client.events.get({ calendarId, eventId: id });
  return toSiteEvent(res.data);
};

export const createEvent = async (input: EventInput): Promise<SiteEvent> => {
  const { client, calendarId } = requireClient();
  const res = await client.events.insert({ calendarId, requestBody: toRequestBody(input) });
  const event = toSiteEvent(res.data);
  if (!event) {
    throw new Error('Calendar returned an unusable event.');
  }
  return event;
};

export const updateEvent = async (id: string, input: EventInput): Promise<SiteEvent> => {
  const { client, calendarId } = requireClient();
  // update rather than patch, so clearing a field actually clears it
  const res = await client.events.update({
    calendarId,
    eventId: id,
    requestBody: toRequestBody(input),
  });
  const event = toSiteEvent(res.data);
  if (!event) {
    throw new Error('Calendar returned an unusable event.');
  }
  return event;
};

export const deleteEvent = async (id: string): Promise<void> => {
  const { client, calendarId } = requireClient();
  await client.events.delete({ calendarId, eventId: id });
};

/** Events that ended more than the grace period ago: safe to remove. */
export const listExpiredEvents = async (): Promise<SiteEvent[]> => {
  const { client, calendarId } = requireClient();
  const cutoff = DateTime.now().setZone(zone()).minus({ hours: DELETE_GRACE_HOURS });

  const res = await client.events.list({
    calendarId,
    timeMax: cutoff.toISO() ?? undefined,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  return (res.data.items ?? [])
    .map(toSiteEvent)
    .filter((e): e is SiteEvent => e !== null)
    // timeMax filters on start; re-check the end so a long event is never cut early
    .filter((e) => DateTime.fromISO(e.end).setZone(zone()) < cutoff);
};
