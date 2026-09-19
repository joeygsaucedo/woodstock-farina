import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // Keep in sync with SITE_URL in src/lib/site.ts.
  site: process.env.PUBLIC_SITE_URL ?? 'https://project-bo5zl.vercel.app',
  // Astro 5 removed 'hybrid': 'static' now prerenders by default and honours
  // `export const prerender = false` on the API routes.
  output: 'static',
  adapter: vercel({
    maxDuration: 30,
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
