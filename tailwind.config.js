
/** @type {import('tailwindcss').Config} */
export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        // Primary Colors
        navy: {
          DEFAULT: '#0A2540',
          50: '#E8EDF2',
          100: '#C5D1DE',
          200: '#9FB3C7',
          300: '#7895B0',
          400: '#5A7D9E',
          500: '#3D658C',
          600: '#2A4D73',
          700: '#1A3A5C',
          800: '#0A2540',
          900: '#061829',
        },
        teal: {
          DEFAULT: '#0FB9B1',
          50: '#E6F9F8',
          100: '#B3EDEA',
          200: '#80E1DC',
          300: '#4DD5CE',
          400: '#26CBC3',
          500: '#0FB9B1',
          600: '#0D9A94',
          700: '#0A7B77',
          800: '#085C5A',
          900: '#053D3C',
        },
        // Secondary Colors
        success: {
          DEFAULT: '#2ECC71',
          50: '#E9F9EF',
          100: '#C7F0D5',
          200: '#A5E7BB',
          300: '#83DEA1',
          400: '#61D587',
          500: '#2ECC71',
          600: '#25A85D',
          700: '#1C8449',
          800: '#136035',
          900: '#0A3C21',
        },
        warning: {
          DEFAULT: '#F5A623',
          50: '#FEF6E6',
          100: '#FCE8BF',
          200: '#FADA98',
          300: '#F8CC71',
          400: '#F6BE4A',
          500: '#F5A623',
          600: '#D18A1C',
          700: '#AD6E15',
          800: '#89520E',
          900: '#653607',
        },
        critical: {
          DEFAULT: '#E74C3C',
          50: '#FDEDEB',
          100: '#F9CCC7',
          200: '#F5ABA3',
          300: '#F18A7F',
          400: '#ED695B',
          500: '#E74C3C',
          600: '#C13E31',
          700: '#9B3026',
          800: '#75221B',
          900: '#4F1410',
        },
        // Neutral Colors
        charcoal: {
          DEFAULT: '#2E2E2E',
          50: '#F5F5F5',
          100: '#E0E0E0',
          200: '#BDBDBD',
          300: '#9E9E9E',
          400: '#757575',
          500: '#616161',
          600: '#424242',
          700: '#2E2E2E',
          800: '#1A1A1A',
          900: '#0D0D0D',
        },
        surface: {
          DEFAULT: '#F4F6F8',
          50: '#FFFFFF',
          100: '#F4F6F8',
          200: '#E8ECF0',
          300: '#DCE2E8',
          400: '#D0D8E0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(10, 37, 64, 0.1), 0 1px 2px -1px rgba(10, 37, 64, 0.1)',
        'card-hover': '0 4px 6px -1px rgba(10, 37, 64, 0.1), 0 2px 4px -2px rgba(10, 37, 64, 0.1)',
        'elevated': '0 10px 15px -3px rgba(10, 37, 64, 0.1), 0 4px 6px -4px rgba(10, 37, 64, 0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
