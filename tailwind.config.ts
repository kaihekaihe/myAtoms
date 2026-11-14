import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#131217',
          900: '#1a1922',
          800: '#24232e',
          700: '#32313e',
          400: '#8b8a99',
          300: '#b3b2bf',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(19,18,23,0.05), 0 4px 16px rgba(19,18,23,0.06)',
      },
    },
  },
  plugins: [],
};

export default config;