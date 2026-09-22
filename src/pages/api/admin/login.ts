import type { APIRoute } from 'astro';
import { hasAdminConfig, isPasswordCorrect, sessionCookieHeader, clearSessionCookieHeader } from '../../../lib/adminAuth';
import { createRateLimiter, getClientKey } from '../../../lib/rateLimit';

export const prerender = false;

// The only credential is a password, so brute force is the realistic attack.
const isRateLimited = createRateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });

const json = (payload: Record<string, unknown>, status = 200, cookie?: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!hasAdminConfig()) {
    console.error('Admin login attempted but ADMIN_PASSWORD/ADMIN_SESSION_SECRET are not set.');
    return json({ success: false, message: 'Admin access is not configured.' }, 503);
  }

  if (isRateLimited(getClientKey(request))) {
    return json({ success: false, message: 'Too many attempts. Try again shortly.' }, 429);
  }

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    password = String(body.password ?? '');
  } catch {
    return json({ success: false, message: 'Invalid request.' }, 400);
  }

  if (!isPasswordCorrect(password)) {
    // Deliberately vague: no hint about whether the password was close.
    return json({ success: false, message: 'Incorrect password.' }, 401);
  }

  return json({ success: true }, 200, sessionCookieHeader());
};

export const DELETE: APIRoute = () =>
  json({ success: true }, 200, clearSessionCookieHeader());
