import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c', // High-contrast outdoor orange
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        surface: {
          sunlight: '#ffffff',
          canvas: '#f8fafc',
          card: '#ffffff',
          dark: '#0f172a',
        },
      },
      fontSize: {
        // Enforce 16px min on form inputs to prevent iOS auto-zoom
        'touch-input': ['16px', { lineHeight: '24px' }],
        'sunlight-sm': ['14px', { lineHeight: '20px' }],
        'sunlight-base': ['16px', { lineHeight: '24px' }],
        'sunlight-lg': ['18px', { lineHeight: '28px' }],
        'sunlight-xl': ['20px', { lineHeight: '28px' }],
        'sunlight-2xl': ['24px', { lineHeight: '32px' }],
      },
      minHeight: {
        'touch': '48px', // Mobile ergonomic tap target standard
        'touch-lg': '56px',
      },
      minWidth: {
        'touch': '48px',
      },
    },
  },
  plugins: [],
};

export default config;
