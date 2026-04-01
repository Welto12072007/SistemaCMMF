/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef9ee',
          100: '#fdf0d3',
          200: '#fae0a5',
          300: '#f6ca6d',
          400: '#f2b034',
          500: '#ef9a10',
          600: '#d97c09',
          700: '#b45c0b',
          800: '#924910',
          900: '#783d11',
        },
        sidebar: {
          bg: '#1a1625',
          hover: '#2d2640',
          active: '#3d3555',
        },
      },
    },
  },
  plugins: [],
}
