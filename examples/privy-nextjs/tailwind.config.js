/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        starknet: {
          dark: '#0C0C4F',
          primary: '#403DED',
          light: '#8B8BD9',
        }
      }
    },
  },
  plugins: [],
}
