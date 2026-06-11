/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0e1a',
        card: '#111827',
        'card-hover': '#1a2332',
        border: '#1e293b',
        accent: '#00f5d4',
        'accent-dim': '#00c4a7',
        warning: '#ff6b35',
        danger: '#ef4444',
        muted: '#9ca3af',
        success: '#22c55e',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Noto Sans SC', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
