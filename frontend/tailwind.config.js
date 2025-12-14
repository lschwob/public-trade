/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'alert-critical': '#dc2626',
        'alert-high': '#ea580c',
        'alert-medium': '#eab308',
      }
    },
  },
  plugins: [],
}




