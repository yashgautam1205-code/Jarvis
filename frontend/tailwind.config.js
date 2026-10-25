/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg: '#05080D',
          'bg-secondary': '#0A1422',
          cyan: '#00E5FF',
          ice: '#62BFFF',
          text: '#EAF7FF',
          muted: '#8297AB',
          error: '#FF3D3D',
          success: '#00FF88',
          warning: '#FFB800',
          'panel': 'rgba(10, 20, 34, 0.7)',
          'border': 'rgba(0, 229, 255, 0.15)',
          'border-bright': 'rgba(0, 229, 255, 0.35)',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 229, 255, 0.15), 0 0 60px rgba(0, 229, 255, 0.05)',
        'glow-cyan-bright': '0 0 20px rgba(0, 229, 255, 0.3), 0 0 60px rgba(0, 229, 255, 0.1)',
        'glow-success': '0 0 20px rgba(0, 255, 136, 0.2)',
        'glow-error': '0 0 20px rgba(255, 61, 61, 0.2)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 20s linear infinite',
        'spin-reverse-slow': 'spin 15s linear infinite reverse',
        'float': 'float 6s ease-in-out infinite',
        'scan-line': 'scanLine 8s linear infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(0, 229, 255, 0.03) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(0, 229, 255, 0.03) 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
    },
  },
  plugins: [],
};
