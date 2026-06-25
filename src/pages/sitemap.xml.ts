import type { APIRoute } from 'astro';

const BASE_URL = 'https://woodstockfarina.com';

const routes = ['/', '/about', '/menu', '/booking', '/gallery', '/contact'];

export const GET: APIRoute = () => {
  const urls = routes
    .map((route) => {
      const loc = `${BASE_URL}${route}`;
      return `<url><loc>${loc}</loc><changefreq>weekly</changefreq><priority>${route === '/' ? '1.0' : '0.8'}</priority></url>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
