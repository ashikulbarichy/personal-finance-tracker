/** @type {import('tailwindcss').Config} */

/* Helper: build a channel-based color that supports opacity modifiers. */
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/* Build a full 50–950 ramp from a base token name, clamping the extreme
 * shades to the nearest defined step. Used to alias stray decorative color
 * families onto our small token set so no un-themed color survives. */
const ramp = (base) => ({
  50: c(`${base}-100`),
  100: c(`${base}-100`),
  200: c(`${base}-200`),
  300: c(`${base}-300`),
  400: c(`${base}-400`),
  500: c(`${base}-500`),
  600: c(`${base}-600`),
  700: c(`${base}-700`),
  800: c(`${base}-700`),
  900: c(`${base}-700`),
  950: c(`${base}-700`),
});

/* Neutral ramp covering all 50–950 shades from the slate tokens. */
const neutral = {
  50: c('slate-50'),
  100: c('slate-100'),
  200: c('slate-200'),
  300: c('slate-300'),
  400: c('slate-400'),
  500: c('slate-500'),
  600: c('slate-600'),
  700: c('slate-700'),
  800: c('slate-800'),
  900: c('slate-900'),
  950: c('slate-950'),
};

const positive = {
  50: c('emerald-200'),
  100: c('emerald-200'),
  200: c('emerald-200'),
  300: c('emerald-300'),
  400: c('emerald-400'),
  500: c('emerald-500'),
  600: c('emerald-600'),
  700: c('emerald-600'),
  800: c('emerald-600'),
  900: c('emerald-600'),
  950: c('emerald-600'),
};

const warn = {
  50: c('amber-100'),
  100: c('amber-100'),
  200: c('amber-100'),
  300: c('amber-400'),
  400: c('amber-400'),
  500: c('amber-500'),
  600: c('amber-600'),
  700: c('amber-600'),
  800: c('amber-600'),
  900: c('amber-600'),
  950: c('amber-600'),
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        /* Modernist: Archivo for everything (headings 800, body 400/600). */
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        manrope: ['Archivo', 'ui-sans-serif', 'sans-serif'],
      },
      colors: {
        /* ---- Semantic surface tokens ---- */
        app: c('app'),
        surface: c('surface'),
        card: c('card'),
        elevated: c('elevated'),
        hover: c('hover'),
        line: c('line'),
        'line-strong': c('line-strong'),

        /* ---- Neutral ramp (theme-aware) ---- */
        slate: {
          50: c('slate-50'),
          100: c('slate-100'),
          200: c('slate-200'),
          300: c('slate-300'),
          400: c('slate-400'),
          500: c('slate-500'),
          600: c('slate-600'),
          700: c('slate-700'),
          800: c('slate-800'),
          900: c('slate-900'),
          950: c('slate-950'),
        },

        /* ---- Accent ---- */
        blue: {
          100: c('blue-100'),
          200: c('blue-200'),
          300: c('blue-300'),
          400: c('blue-400'),
          500: c('blue-500'),
          600: c('blue-600'),
          700: c('blue-700'),
        },

        /* ---- Semantic accents ---- */
        emerald: {
          200: c('emerald-200'),
          300: c('emerald-300'),
          400: c('emerald-400'),
          500: c('emerald-500'),
          600: c('emerald-600'),
        },
        red: {
          300: c('red-300'),
          400: c('red-400'),
          500: c('red-500'),
          600: c('red-600'),
          800: c('red-800'),
          900: c('red-900'),
        },
        rose: {
          200: c('rose-200'),
          400: c('rose-400'),
          500: c('rose-500'),
          600: c('rose-600'),
        },
        amber: {
          100: c('amber-100'),
          400: c('amber-400'),
          500: c('amber-500'),
          600: c('amber-600'),
        },

        /* ---- Stray decorative families → collapsed onto the palette ----
         * Keeps the app to one accent + muted semantics. Decorative hues
         * become neutral; "good"/"warning"-ish hues keep their meaning. */
        indigo: ramp('blue'),
        violet: neutral,
        purple: neutral,
        fuchsia: neutral,
        pink: neutral,
        sky: ramp('blue'),
        cyan: neutral,
        teal: neutral,
        green: positive,
        lime: positive,
        orange: warn,
        yellow: warn,
      },
      /* Modernist: no rounded corners anywhere (only true circles keep 'full'). */
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-lg)',
        '2xl': 'var(--shadow-lg)',
        soft: 'var(--shadow-sm)',
        card: 'var(--shadow-sm)',
        pop: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        /* Apple-style spring-ish ease. */
        smooth: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
