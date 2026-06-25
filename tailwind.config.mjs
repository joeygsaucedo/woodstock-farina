/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        wood: {
          50: '#faf8f5',
          100: '#f5f0e8',
          200: '#e8dcc8',
          300: '#d8c4a0',
          400: '#c8a876',
          500: '#b8924f',
          600: '#a07a3e',
          700: '#856334',
          800: '#6d512f',
          900: '#5a4429',
        },
        fire: {
          50: '#fef4ee',
          100: '#fde6d7',
          200: '#fac9ae',
          300: '#f7a47a',
          400: '#f37244',
          500: '#f04a1f',
          600: '#e13215',
          700: '#bb2313',
          800: '#951f17',
          900: '#791c16',
        },
      },
      fontFamily: {
        heading: ['Playfair Display', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
