import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fraylon: {
          teal: '#1E5F7E',
          'teal-dark': '#164659',
          'teal-light': '#3A7E9D',
          navy: '#0F2A3A',
          ink: '#0B1A24',
          paper: '#F7F7F4',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
