/** @type {import('tailwindcss').Config} */
export default {
    content: [
          "./index.html",
          "./src/**/*.{js,ts,jsx,tsx}",
        ],
    darkMode: 'class',
    theme: {
          extend: {
                  colors: {
                            primary: {
                                        50: '#eef2ff',
                                        100: '#e0e7ff',
                                        200: '#c7d2fe',
                                        300: '#a5b4fc',
                                        400: '#818cf8',
                                        500: '#6366f1',
                                        600: '#4f46e5',
                                        700: '#4338ca',
                                        800: '#3730a3',
                                        900: '#312e81',
                                        950: '#1e1b4b',
                            },
                            success: {
                                        50: '#ecfdf5',
                                        100: '#d1fae5',
                                        200: '#a7f3d0',
                                        300: '#6ee7b7',
                                        400: '#34d399',
                                        500: '#10b981',
                                        600: '#059669',
                                        700: '#047857',
                                        800: '#065f46',
                                        900: '#064e3b',
                            },
                            warning: {
                                        50: '#fffbeb',
                                        100: '#fef3c7',
                                        200: '#fde68a',
                                        300: '#fcd34d',
                                        400: '#fbbf24',
                                        500: '#f59e0b',
                                        600: '#d97706',
                                        700: '#b45309',
                                        800: '#92400e',
                                        900: '#78350f',
                            },
                            error: {
                                        50: '#fef2f2',
                                        100: '#fee2e2',
                                        200: '#fecaca',
                                        300: '#fca5a5',
                                        400: '#f87171',
                                        500: '#ef4444',
                                        600: '#dc2626',
                                        700: '#b91c1c',
                                        800: '#991b1b',
                                        900: '#7f1d1d',
                            },
                  },
                  fontFamily: {
                            sans: ['Inter', 'system-ui', 'sans-serif'],
                  },
                  boxShadow: {
                            'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
                            'glass-lg': '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                            'glass-dark': '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                            'glow': '0 0 20px rgba(99, 102, 241, 0.15)',
                            'glow-lg': '0 0 40px rgba(99, 102, 241, 0.2)',
                            'card': '0 1px 3px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.04)',
                            'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 12px 28px rgba(0,0,0,0.06)',
                  },
                  backdropBlur: {
                            'xs': '2px',
                  },
                  animation: {
                            'fade-in': 'fade-in 0.3s ease-out',
                            'slide-up': 'slide-up 0.4s ease-out',
                            'slide-down': 'slide-down 0.3s ease-out',
                            'scale-in': 'scale-in 0.2s ease-out',
                            'shimmer': 'shimmer 2s linear infinite',
                            'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
                            'float': 'float 3s ease-in-out infinite',
                  },
                  keyframes: {
                            'fade-in': {
                                        from: { opacity: '0' },
                                        to: { opacity: '1' },
                            },
                            'slide-up': {
                                        from: { transform: 'translateY(16px)', opacity: '0' },
                                        to: { transform: 'translateY(0)', opacity: '1' },
                            },
                            'slide-down': {
                                        from: { transform: 'translateY(-8px)', opacity: '0' },
                                        to: { transform: 'translateY(0)', opacity: '1' },
                            },
                            'scale-in': {
                                        from: { transform: 'scale(0.95)', opacity: '0' },
                                        to: { transform: 'scale(1)', opacity: '1' },
                            },
                            'shimmer': {
                                        '0%': { backgroundPosition: '-200% 0' },
                                        '100%': { backgroundPosition: '200% 0' },
                            },
                            'pulse-soft': {
                                        '0%, 100%': { opacity: '1' },
                                        '50%': { opacity: '0.7' },
                            },
                            'float': {
                                        '0%, 100%': { transform: 'translateY(0)' },
                                        '50%': { transform: 'translateY(-4px)' },
                            },
                  },
          },
    },
    plugins: [],
}
