import nodemailer from 'nodemailer';

// Vite inlines `import.meta.env.FOO` at build time when FOO exists in the build
// environment, and bakes in `undefined` when it doesn't. Falling back to
// process.env means a variable added in Vercel after a build still resolves at
// runtime instead of staying permanently undefined.
// Note the `||`: Vite inlines an empty string for a variable that exists but is
// blank at build time, and `??` would treat that as a real value and never
// consult process.env.
const readEnv = (inlined: string | undefined, key: string): string | undefined => {
  const trimmed = inlined?.trim() || process.env[key]?.trim();
  return trimmed ? trimmed : undefined;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
};

const smtpUser = readEnv(import.meta.env.SMTP_USER, 'SMTP_USER');

export const EMAIL_CONFIG = {
  smtpHost: readEnv(import.meta.env.SMTP_HOST, 'SMTP_HOST'),
  smtpPort: parseNumber(readEnv(import.meta.env.SMTP_PORT, 'SMTP_PORT'), 587),
  smtpSecure: parseBoolean(readEnv(import.meta.env.SMTP_SECURE, 'SMTP_SECURE'), false),
  smtpUser,
  smtpPass: readEnv(import.meta.env.SMTP_PASS, 'SMTP_PASS'),
  // Gmail rewrites the From header to the authenticated account unless the
  // address is a verified "Send mail as" alias, so this should normally match
  // SMTP_USER.
  fromEmail: readEnv(import.meta.env.SMTP_FROM_EMAIL, 'SMTP_FROM_EMAIL') ?? smtpUser,
  fromName: readEnv(import.meta.env.SMTP_FROM_NAME, 'SMTP_FROM_NAME') ?? 'Woodstock Farina',
  corporateEmailTo:
    readEnv(import.meta.env.CORPORATE_EMAIL_TO, 'CORPORATE_EMAIL_TO') ?? 'Woodstockfarina@gmail.com',
};

const REQUIRED_SETTINGS = [
  ['SMTP_HOST', EMAIL_CONFIG.smtpHost],
  ['SMTP_USER', EMAIL_CONFIG.smtpUser],
  ['SMTP_PASS', EMAIL_CONFIG.smtpPass],
  ['SMTP_FROM_EMAIL (or SMTP_USER)', EMAIL_CONFIG.fromEmail],
  ['CORPORATE_EMAIL_TO', EMAIL_CONFIG.corporateEmailTo],
] as const;

/** Names of the settings that are missing, for logging and diagnostics. */
export const missingEmailConfig = (): string[] =>
  REQUIRED_SETTINGS.filter(([, value]) => !value).map(([name]) => name);

export const hasEmailConfig = (): boolean => missingEmailConfig().length === 0;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (value: string): boolean =>
  value.length <= 254 && EMAIL_PATTERN.test(value);

// Values that reach a header (subject, display names) must not carry CR/LF, or
// a submitted name could inject extra headers. Also keeps subjects sane.
const sanitizeHeader = (value: string, maxLength = 200): string =>
  value.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);

let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter | null => {
  if (transporter) {
    return transporter;
  }

  if (!hasEmailConfig()) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.smtpHost,
    port: EMAIL_CONFIG.smtpPort,
    secure: EMAIL_CONFIG.smtpSecure,
    auth: {
      user: EMAIL_CONFIG.smtpUser,
      pass: EMAIL_CONFIG.smtpPass,
    },
    // Serverless invocations are capped at 30s, so never let a stalled SMTP
    // handshake burn the whole budget.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return transporter;
};

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: 'missing-config' | 'invalid-recipient' };

export const sendEmail = async ({
  to,
  subject,
  text,
  html,
  replyTo,
}: SendEmailParams): Promise<SendEmailResult> => {
  const mailer = getTransporter();

  if (!mailer) {
    return { sent: false, reason: 'missing-config' };
  }

  if (!isValidEmail(to)) {
    return { sent: false, reason: 'invalid-recipient' };
  }

  await mailer.sendMail({
    from: `"${sanitizeHeader(EMAIL_CONFIG.fromName, 78)}" <${EMAIL_CONFIG.fromEmail}>`,
    to,
    subject: sanitizeHeader(subject),
    text,
    html,
    replyTo: replyTo && isValidEmail(replyTo) ? replyTo : undefined,
  });

  return { sent: true };
};
