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
        // LinkedIn brand blue scale
        primary: {
          50:  '#e8f3ff',
          100: '#d0e6ff',
          200: '#a6ccff',
          300: '#74aeff',
          400: '#3d8dff',
          500: '#0a66c2', // LinkedIn signature
          600: '#0958a6',
          700: '#07498a',
          800: '#053a70',
          900: '#042d59',
          950: '#021e3d',
        },
        // Warm neutral surface scale (LinkedIn signature off-white)
        surface: {
          canvas: '#f4f2ee',
          card: '#ffffff',
          subtle: '#eef3f8',
          hover: '#f3f2ef',
          selected: '#e8f3ff',
        },
        ink: {
          primary: 'rgba(0, 0, 0, 0.9)',
          secondary: 'rgba(0, 0, 0, 0.6)',
          tertiary: 'rgba(0, 0, 0, 0.45)',
          border: 'rgba(0, 0, 0, 0.15)',
          divider: 'rgba(0, 0, 0, 0.08)',
        },
        success: {
          50:  '#e8f5ee',
          100: '#c7e8d5',
          200: '#9dd7b3',
          300: '#6dc48e',
          400: '#3fa96a',
          500: '#057642',
          600: '#046237',
          700: '#034d2b',
          800: '#023820',
          900: '#012415',
        },
        warning: {
          50:  '#fdf3ec',
          100: '#fae0cb',
          200: '#f5c599',
          300: '#eea566',
          400: '#d97d3a',
          500: '#b24020',
          600: '#99371b',
          700: '#7a2c16',
          800: '#5c2010',
          900: '#3d150a',
        },
        error: {
          50:  '#fdecec',
          100: '#fbd0d0',
          200: '#f7a5a5',
          300: '#f07373',
          400: '#e54040',
          500: '#cc1016',
          600: '#a50d13',
          700: '#820a0f',
          800: '#5f070b',
          900: '#3d0407',
        },
        premium: {
          50:  '#fdf6e8',
          100: '#f5e6cc',
          500: '#915907',
          600: '#74470a',
        },
      },
      fontFamily: {
        sans: ['Rubik', 'Source Sans 3', 'Source Sans Pro', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        'display':  ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'h1':       ['24px', { lineHeight: '32px', fontWeight: '700' }],
        'h2':       ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'h3':       ['16px', { lineHeight: '24px', fontWeight: '600' }],
        'body':     ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm':  ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'small':    ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
      borderRadius: {
        'card': '8px',
        'input': '4px',
        'pill': '9999px',
      },
      boxShadow: {
        // Flat with subtle lift — LinkedIn's actual card elevation
        'card': '0 0 0 1px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.06)',
        'card-hover': '0 0 0 1px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)',
        'modal': '0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08)',
        'dropdown': '0 0 0 1px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.12)',
        // Legacy aliases kept for backward compatibility
        'glass': '0 0 0 1px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.06)',
        'glass-lg': '0 4px 12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)',
        'glass-dark': '0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)',
        'glow': '0 0 0 1px rgba(10,102,194,0.25)',
        'glow-lg': '0 0 0 2px rgba(10,102,194,0.3)',
      },
      backdropBlur: {
        'xs': '2px',
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
        'shimmer': 'shimmer 1.8s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          from: { transform: 'translateY(-4px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.98)', opacity: '0' },
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
