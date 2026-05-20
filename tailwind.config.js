/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        brand: '#7669ff',
        'brand-indigo': '#280063',
        'brand-mint':   '#b2f9eb',
        'brand-pink':   '#ffabff',
        'brand-violet': '#8b88f1',
        'brand-ink':    '#0c0040',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '2xl': '16px',
        '3xl': '22px',
      },
      fontFamily: {
        sans:    ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.04em' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter:  '-0.03em',
        tight:    '-0.02em',
      },
      boxShadow: {
        /* Apple-style multi-layer shadows */
        'xs':          '0 0 0 1px rgba(0,0,0,0.04)',
        'sm':          '0 0 0 1px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.04)',
        'card':        '0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.04)',
        'card-hover':  '0 0 0 1px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.06), 0 20px 40px rgba(0,0,0,0.08)',
        'float':       '0 0 0 1px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.08), 0 32px 64px rgba(0,0,0,0.12)',
        'modal':       '0 0 0 1px rgba(0,0,0,0.07), 0 16px 32px rgba(0,0,0,0.10), 0 48px 96px rgba(0,0,0,0.14)',
        'brand-sm':    '0 0 0 1px rgba(118,105,255,0.18), 0 2px 8px rgba(40,0,99,0.20)',
        'brand':       '0 0 0 1px rgba(118,105,255,0.22), 0 4px 16px rgba(40,0,99,0.28)',
        'brand-lg':    '0 4px 24px rgba(40,0,99,0.34)',
        'inset':       'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.04)',
      },
      backgroundImage: {
        'shimmer':     'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.8) 50%, transparent 60%)',
        'noise':       "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':     'fadeIn 0.18s ease-out',
        'slide-up':    'slideUp 0.22s cubic-bezier(0.22,1,0.36,1)',
        'shimmer':     'shimmer 2s linear infinite',
        'skeleton':    'skeleton 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:  { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        shimmer:  { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        skeleton: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
      },
    },
  },
  plugins: [],
};
