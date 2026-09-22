/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly BOOKING_MIN_NOTICE_DAYS?: string;
	readonly BOOKING_DEFAULT_DURATION_HOURS?: string;
	readonly BOOKING_SERVICE_START_HOUR?: string;
	readonly BOOKING_SERVICE_END_HOUR?: string;
	readonly BOOKING_TIMEZONE?: string;
	readonly BOOKING_CALENDAR_ID?: string;
	readonly GOOGLE_CALENDAR_ID?: string;
	readonly GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
	readonly GOOGLE_PRIVATE_KEY?: string;
	readonly SMTP_HOST?: string;
	readonly SMTP_PORT?: string;
	readonly SMTP_SECURE?: string;
	readonly SMTP_USER?: string;
	readonly SMTP_PASS?: string;
	readonly SMTP_FROM_EMAIL?: string;
	readonly SMTP_FROM_NAME?: string;
	readonly CORPORATE_EMAIL_TO?: string;
	readonly EVENTS_CALENDAR_ID?: string;
	readonly ADMIN_PASSWORD?: string;
	readonly ADMIN_SESSION_SECRET?: string;
	readonly BLOB_READ_WRITE_TOKEN?: string;
	readonly CRON_SECRET?: string;
	readonly PUBLIC_SITE_URL?: string;
}
