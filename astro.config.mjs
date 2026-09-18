import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel/serverless';

// https://astro.build/config
export default defineConfig({
  // Keep in sync with SITE_URL in src/lib/site.ts.
  site: process.env.PUBLIC_SITE_URL ?? 'https://project-bo5zl.vercel.app',
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  output: 'hybrid',
  adapter: vercel({
    maxDuration: 30,
  }),
});
