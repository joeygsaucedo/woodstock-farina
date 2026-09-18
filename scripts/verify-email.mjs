// Checks that the SMTP credentials actually work, without going through Astro.
//
//   npm run email:verify           authenticate only
//   npm run email:verify -- --send authenticate and send a real test email
//
// Reads .env via node --env-file, so it exercises the same variables the
// deployed site uses.
import nodemailer from 'nodemailer';

const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
const missing = required.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error(`Missing required variables: ${missing.join(', ')}`);
  console.error('Add them to .env (and to the Vercel project settings) and try again.');
  process.exit(1);
}

const host = process.env.SMTP_HOST.trim();
const port = Number.parseInt(process.env.SMTP_PORT ?? '587', 10);
const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';
const user = process.env.SMTP_USER.trim();
const fromEmail = (process.env.SMTP_FROM_EMAIL ?? user).trim();
const fromName = (process.env.SMTP_FROM_NAME ?? 'Woodstock Farina').trim();
const to = (process.env.CORPORATE_EMAIL_TO ?? 'Woodstockfarina@gmail.com').trim();

console.log(`Connecting to ${host}:${port} (secure: ${secure}) as ${user}`);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass: process.env.SMTP_PASS },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

try {
  await transporter.verify();
  console.log('SMTP connection and authentication succeeded.');
} catch (error) {
  console.error('SMTP verification failed:', error.message);
  if (error.code === 'EAUTH') {
    console.error(
      'Gmail rejects a normal account password here. Generate an app password at ' +
        'https://myaccount.google.com/apppasswords (requires 2-Step Verification) ' +
        'and use that as SMTP_PASS, with no spaces.',
    );
  }
  process.exit(1);
}

if (!process.argv.includes('--send')) {
  console.log('Skipping test send. Re-run with --send to deliver a real message.');
  process.exit(0);
}

try {
  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: 'Woodstock Farina - SMTP test',
    text: [
      'This is a test message from the Woodstock Farina website.',
      '',
      'If you are reading this, the contact form and booking notifications can send email.',
      '',
      `Sent: ${new Date().toISOString()}`,
      `Host: ${host}:${port}`,
      `From: ${fromEmail}`,
    ].join('\n'),
  });

  console.log(`Test email accepted for delivery to ${to} (id: ${info.messageId})`);
  if (fromEmail !== user) {
    console.warn(
      `Note: SMTP_FROM_EMAIL (${fromEmail}) differs from SMTP_USER (${user}). ` +
        'Gmail will rewrite the From header unless that address is a verified "Send mail as" alias.',
    );
  }
} catch (error) {
  console.error('Test send failed:', error.message);
  process.exit(1);
}
