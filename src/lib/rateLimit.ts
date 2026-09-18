interface RateLimitOptions {
  /** Requests allowed per key within the window. */
  max: number;
  windowMs: number;
  /** Cap on tracked keys, so a flood of distinct IPs cannot grow the map forever. */
  maxKeys?: number;
}

/**
 * Fixed-window limiter held in module memory.
 *
 * Serverless spreads traffic across instances, so each instance enforces its own
 * budget: this trims scripted abuse rather than guaranteeing a global ceiling.
 * A platform-level rule (Vercel Firewall) is the durable control.
 */
export const createRateLimiter = ({ max, windowMs, maxKeys = 500 }: RateLimitOptions) => {
  const hits = new Map<string, number[]>();

  const prune = (now: number) => {
    for (const [key, timestamps] of hits) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
        hits.delete(key);
      }
    }
  };

  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

    if (recent.length >= max) {
      hits.set(key, recent);
      return true;
    }

    recent.push(now);
    hits.set(key, recent);

    if (hits.size > maxKeys) {
      prune(now);
      // Still over budget after pruning: drop the oldest entries outright rather
      // than let the map grow without bound.
      if (hits.size > maxKeys) {
        for (const key of [...hits.keys()].slice(0, hits.size - maxKeys)) {
          hits.delete(key);
        }
      }
    }

    return false;
  };
};

/**
 * Client address for rate limiting. Prefers x-real-ip, which Vercel sets at the
 * edge. The left-most x-forwarded-for entry is caller-supplied and trivially
 * spoofed, so the right-most entry is used as the fallback instead.
 */
export const getClientKey = (request: Request): string => {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const parts = forwarded?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];

  return parts[parts.length - 1] ?? 'unknown';
};
