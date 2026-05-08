/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0a0a0b', 900: '#111113', 800: '#191a1d', 700: '#26272b', 600: '#3a3b40', 500: '#5a5b62', 400: '#84858d', 300: '#a8a9b0', 200: '#cdced3', 100: '#e8e9ec', 50:  '#f5f6f8' },
        gold: { 500: '#d4a44e', 400: '#e3bd6f', 600: '#b18733' }
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
};
