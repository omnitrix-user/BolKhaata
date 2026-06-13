/** Tailwind config mapping BolKhaata's master design tokens.
 *  The shipped app is zero-build (styles.css uses the same CSS custom
 *  properties), but this lets you adopt a Tailwind toolchain without
 *  re-deriving the palette. Run e.g.:
 *    npx tailwindcss -i ./styles.css -o ./dist.css --watch
 */
export default {
  content: ['./index.html', './app.js'],
  theme: {
    extend: {
      colors: {
        surface: {
          primary: 'var(--surface-primary)',     // #4A151C Deep Maroon
          container: 'var(--surface-container)',  // #F0E7D5 Warm Cream
        },
        brand: { gold: 'var(--brand-gold)' },     // #D4AF37 Rich Gold
        action: { teal: 'var(--action-teal)' },   // #008080 Vibrant Teal
        status: {
          positive: 'var(--status-positive)',     // #5A5E27 Olive Green
          negative: 'var(--status-negative)',     // #74070E Deep Crimson
        },
        text: {
          light: 'var(--text-light)',             // #FFFFFF
          dark: 'var(--text-dark)',               // #1A1A1A
        },
      },
      maxWidth: { app: '480px' },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
      },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
    },
  },
  plugins: [],
};
