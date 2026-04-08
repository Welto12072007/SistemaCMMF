/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8f7fc',
          100: '#d8f4ff',
          200: '#b0e8fc',
          300: '#7ed9ed',
          400: '#4fc8e0',
          500: '#2183a8',
          600: '#1b6f90',
          700: '#155a76',
          800: '#10475d',
          900: '#0c3549',
        },
        sidebar: {
          bg: '#0c3549',
          hover: '#155a76',
          active: '#2183a8',
        },
        cmmf: {
          blue: '#2183a8',
          cyan: '#7ed9ed',
          ice: '#d8f4ff',
          black: '#000000',
          white: '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
