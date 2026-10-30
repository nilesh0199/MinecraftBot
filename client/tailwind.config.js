/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mc-dark': '#101114',
        'mc-panel': '#1a1b20',
        'mc-card': '#22232a',
        'mc-slot': '#17181c',
        'mc-border': '#333540',
        'mc-border-light': '#4e5163',
        'mc-green': '#2ecc71',
        'mc-green-hover': '#27ae60',
        'mc-emerald': '#10b981',
        'mc-diamond': '#38bdf8',
        'mc-gold': '#f59e0b',
        'mc-red': '#ef4444',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        minecraft: ['"VT323"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'mc-btn': 'inset 2px 2px 0px rgba(255, 255, 255, 0.2), inset -2px -2px 0px rgba(0, 0, 0, 0.4), 0 4px 6px -1px rgba(0, 0, 0, 0.5)',
        'mc-btn-active': 'inset 2px 2px 0px rgba(0, 0, 0, 0.6), inset -2px -2px 0px rgba(255, 255, 255, 0.1)',
        'mc-slot': 'inset 2px 2px 0px #0a0a0c, inset -2px -2px 0px #2e303a',
        'mc-panel': 'inset 2px 2px 0px rgba(255, 255, 255, 0.08), inset -2px -2px 0px rgba(0, 0, 0, 0.6), 0 10px 25px -5px rgba(0, 0, 0, 0.7)',
      }
    },
  },
  plugins: [],
}
