/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Calm, trustworthy palette. Ink for text, slate for surfaces,
        // a single teal accent for actions and positive events.
        ink: '#0B1220',
        surface: '#F7F8FA',
        border: '#E4E7EC',
        accent: '#0F766E',      // teal-700
        accentSoft: '#CCFBF1',  // teal-100
        credit: '#047857',      // emerald-700 — money in
        debit: '#B91C1C',       // red-700   — money out
      },
    },
  },
  plugins: [],
};
