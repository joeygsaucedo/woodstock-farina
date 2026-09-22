import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { readEnv } from './env';

const ADMIN_PASSWORD = readEnv(import.meta.env.ADMIN_PASSWORD, 'ADMIN_PASSWORD');
const SESSION_SECRET = readEnv(import.meta.env.ADMIN_SESSION_SECRET, 'ADMIN_SESSION_SECRET');

export const SESSION_COOKIE = 'wf_admin';
const SESSION_DAYS = 7;

export const hasAdminConfig = (): boolean => Boolean(ADMIN_PASSWORD && SESSION_SECRET);

/** Compares without leaking length or content through timing. */
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch, so hash first to equalise length
  const hashA = createHmac('sha256', 'compare').update(bufA).digest();
  const hashB = createHmac('sha256', 'compare').update(bufB).digest();
  return timingSafeEqual(hashA, hashB);
};

export const isPasswordCorrect = (candidate: string): boolean => {
  if (!ADMIN_PASSWORD) {
    return false;
  }
  return safeEqual(candidate, ADMIN_PASSWORD);
};

const sign = (payload: string): string =>
  createHmac('sha256', SESSION_SECRET ?? '').update(payload).digest('base64url');

/**
 * Token is `expiry.nonce.signature`. The browser only ever holds this, never
 * the password, and the signature means it cannot be forged or extended.
 */
export const createSessionToken = (): string => {
  const expiry = Date.now() + SESSION_DAYS * 864e5;
  const nonce = randomBytes(8).toString('base64url');
  const payload = `${expiry}.${nonce}`;
  return `${payload}.${sign(payload)}`;
};

export const isSessionTokenValid = (token: string | undefined): boolean => {
  if (!token || !SESSION_SECRET) {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const [expiry, nonce, signature] = parts;
  if (!safeEqual(signature, sign(`${expiry}.${nonce}`))) {
    return false;
  }

  const expiresAt = Number(expiry);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const cookieAttributes = (maxAgeSeconds: number): string =>
  [
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');

export const sessionCookieHeader = (): string =>
  `${SESSION_COOKIE}=${createSessionToken()}; ${cookieAttributes(SESSION_DAYS * 86400)}`;

export const clearSessionCookieHeader = (): string =>
  `${SESSION_COOKIE}=; ${cookieAttributes(0)}`;

const readCookie = (request: Request, name: string): string | undefined => {
  const header = request.headers.get('cookie');
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return undefined;
};

export const isAuthenticated = (request: Request): boolean =>
  isSessionTokenValid(readCookie(request, SESSION_COOKIE));

/** Standard 401 for the admin API routes. */
export const unauthorized = (): Response =>
  new Response(JSON.stringify({ success: false, message: 'Not authorised.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
