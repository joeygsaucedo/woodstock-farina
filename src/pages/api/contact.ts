import type { APIRoute } from 'astro';
import { EMAIL_CONFIG, hasEmailConfig, isValidEmail, missingEmailConfig, sendEmail } from '../../lib/email';

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

const requiredFields = ['name', 'email', 'message'] as const;

// Bots fill every field they find; the form keeps this one off-screen and empty.
const HONEYPOT_FIELD = 'company-website';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const recentSubmissions = new Map<string, number[]>();

// Per-instance only: serverless spreads traffic across instances, so this trims
// naive floods rather than providing a hard guarantee.
const isRateLimited = (key: string): boolean => {
  const now = Date.now();
  const hits = (recentSubmissions.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (hits.length >= RATE_LIMIT_MAX) {
    recentSubmissions.set(key, hits);
    return true;
  }

  hits.push(now);
  recentSubmissions.set(key, hits);

  if (recentSubmissions.size > 500) {
    for (const [entryKey, timestamps] of recentSubmissions) {
      if (timestamps.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
        recentSubmissions.delete(entryKey);
      }
    }
  }

  return false;
};

const getClientKey = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
};

export const POST: APIRoute = async ({ request }) => {
  let payload: Record<string, unknown>;

  try {
    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return json({ success: false, message: 'Request body is required.' }, 400);
    }

    const normalizedBody = rawBody.replace(/^﻿/, '');
    payload = JSON.parse(normalizedBody) as Record<string, unknown>;
  } catch {
    return json({ success: false, message: 'Invalid JSON body.' }, 400);
  }

  // Report success so bots get no signal about why nothing happened.
  if (String(payload[HONEYPOT_FIELD] ?? '').trim()) {
    console.warn('Contact form honeypot triggered.');
    return json({
      success: true,
      message: 'Message received. We will get back to you within 2-3 business days.',
    });
  }

  for (const field of requiredFields) {
    if (!String(payload[field] ?? '').trim()) {
      return json({ success: false, message: `Missing required field: ${field}` }, 400);
    }
  }

  const name = String(payload.name).trim();
  const email = String(payload.email).trim();
  const phone = String(payload.phone ?? '').trim() || 'Not provided';
  const eventType = String(payload['event-type'] ?? '').trim() || 'Not provided';
  const message = String(payload.message).trim();

  if (!isValidEmail(email)) {
    return json({ success: false, message: 'Please enter a valid email address.' }, 400);
  }

  if (message.length > 5000) {
    return json({ success: false, message: 'Message is too long. Please keep it under 5000 characters.' }, 400);
  }

  if (isRateLimited(getClientKey(request))) {
    return json(
      {
        success: false,
        message: "You've sent several messages already. Please give us a little time, or call (661) 754-6510.",
      },
      429,
    );
  }

  if (!hasEmailConfig()) {
    console.error('Contact email not configured. Missing:', missingEmailConfig().join(', '));
    return json(
      {
        success: false,
        message: 'Email service is not configured yet. Please call us at (661) 754-6510.',
      },
      503,
    );
  }

  const subject = `New Contact Message - ${name}`;
  const text = [
    'New contact form submission received.',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Event Type: ${eventType}`,
    '',
    'Message:',
    message,
  ].join('\n');

  try {
    const result = await sendEmail({
      to: EMAIL_CONFIG.corporateEmailTo,
      subject,
      text,
      replyTo: email,
    });

    if (!result.sent) {
      console.error('Contact email not sent:', result.reason);
      return json(
        {
          success: false,
          message: 'Unable to send your message right now. Please call us at (661) 754-6510.',
        },
        503,
      );
    }

    return json({
      success: true,
      message: 'Message received. We will get back to you within 2-3 business days.',
    });
  } catch (error) {
    console.error('Contact email send failed:', error);
    return json(
      {
        success: false,
        message: 'Unable to send your message right now. Please try again shortly.',
      },
      500,
    );
  }
};

export const GET: APIRoute = () => {
  return json({ success: false, message: 'Method not allowed.' }, 405);
};
