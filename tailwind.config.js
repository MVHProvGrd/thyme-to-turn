/** @type {import('tailwindcss').Config} */
// Palette taken from the logo: deep forest wordmark, mid-green thyme leaves, cream page.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F3E9',      // the page in the logo
        card: '#FCFAF3',
        ink: '#1F2A16',        // wordmark, at text weight
        'ink-soft': '#4C5940',
        rule: '#DED8C6',
        thyme: '#2F5320',      // wordmark green — primary
        leaf: '#7FB03F',       // the sprig and the turning arrow — accent
        copper: '#9E5632',     // hazards only
      },
      fontFamily: {
        serif: ['Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
