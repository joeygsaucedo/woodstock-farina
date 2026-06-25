/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly BOOKING_MIN_NOTICE_DAYS?: string;
	readonly BOOKING_DEFAULT_DURATION_HOURS?: string;
	readonly BOOKING_SERVICE_START_HOUR?: string;
	readonly BOOKING_SERVICE_END_HOUR?: string;
	readonly BOOKING_BUFFER_HOURS?: string;
	readonly BOOKING_TIMEZONE?: string;
	readonly BOOKING_CALENDAR_ID?: string;
	readonly GOOGLE_CALENDAR_ID?: string;
	readonly GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
	readonly GOOGLE_PRIVATE_KEY?: string;
}
