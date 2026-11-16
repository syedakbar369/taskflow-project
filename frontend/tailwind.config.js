/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        coral: {
          50: '#FFF4F1',
          100: '#FFE6DF',
          200: '#FFCBBD',
          300: '#FCA58F',
          400: '#F7845F',
          500: '#F06A4A',
          600: '#D9502F',
          700: '#B53F23',
          800: '#8F3420',
          900: '#73301F',
        },
        canvas: '#F7F6F3',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 1px rgba(15, 23, 42, 0.04)',
        pop: '0 8px 24px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};
