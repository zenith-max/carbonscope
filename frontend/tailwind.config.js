/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAFAF8',
        charcoal: '#161816',
        accent: '#2F6D4A',
        muted: '#5B665F',
        border: '#E5E7E1',
        panel: '#FFFFFF',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(16, 24, 40, 0.04)',
      },
      borderRadius: {
        xl: '14px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
