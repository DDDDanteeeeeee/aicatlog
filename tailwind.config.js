/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          dark: '#1D4ED8',
        },
        accent: '#0EA5E9',
      },
      fontFamily: {
        display: ['"Press Start 2P"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        pixel: '0 5px 0 rgba(15, 23, 42, 0.22)',
        'pixel-sm': '0 3px 0 rgba(15, 23, 42, 0.22)',
      },
    },
  },
  plugins: [],
};
