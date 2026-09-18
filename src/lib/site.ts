/**
 * Canonical origin for the site.
 *
 * woodstockfarina.com is not registered yet: it returns NXDOMAIN from public
 * resolvers, so pointing canonical tags and the sitemap at it told crawlers the
 * real address was a domain that does not exist. Until the domain is live this
 * must match the origin the site is actually served from.
 *
 * Override per environment with PUBLIC_SITE_URL, and switch the fallback below
 * once the custom domain resolves.
 */
export const SITE_URL = (
  import.meta.env.PUBLIC_SITE_URL ?? 'https://project-bo5zl.vercel.app'
).replace(/\/$/, '');
