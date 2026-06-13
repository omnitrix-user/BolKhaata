# बोलखाता • BolKhaata — Vendor Ledger (PWA)

A production-ready, offline-first **Progressive Web App** for Indian micro-vendors.
High-contrast, dual-language (Hindi/English), tuned for harsh outdoor sunlight.

> Standalone build — independent of the React/FastAPI app in `../frontend` and `../backend`.
> Zero build step required: it's plain HTML5 + CSS custom properties + vanilla JS (JSDoc-typed).

## Run it

It must be served over `http://` (not `file://`) for the service worker + mic to work:

```bash
cd pwa
python3 -m http.server 4173
# open http://localhost:4173
```

Then **Add to Home Screen** on a phone to launch in standalone mode.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell — navbar, hero, ledger, FABs, tab bar, add-sheet |
| `styles.css` | All design tokens (CSS custom properties) + component styles |
| `app.js` | State (localStorage), balance math, rendering, voice entry |
| `manifest.json` | PWA manifest (standalone, maroon theme) |
| `sw.js` | Service worker — offline app-shell cache |
| `icon.svg` | Maskable app icon |
| `tailwind.config.js` | Optional: same tokens for a Tailwind toolchain |

## Design tokens

| Token | Hex | Use |
|-------|-----|-----|
| `--surface-primary` | `#4A151C` | Canvas, navbar, tab bar |
| `--surface-container` | `#F0E7D5` | Ledger card |
| `--brand-gold` | `#D4AF37` | Titles, header bars, active tab |
| `--action-teal` | `#008080` | FAB, CTAs |
| `--status-positive` | `#5A5E27` | आने हैं (to receive) |
| `--status-negative` | `#74070E` | देने हैं (to pay) |
| `--text-light` | `#FFFFFF` | Text on maroon/teal |
| `--text-dark` | `#1A1A1A` | Text on cream |

## Notes

- **Balance convention:** positive = आने हैं (you receive, emerald); negative = देने हैं (you pay, red with `-` prefix). Row typography flips automatically in `app.js`.
- **Voice entry** uses `webkitSpeechRecognition` (Android Chrome). Where unsupported, it falls back to the manual sheet.
- **Accessibility:** ≥48×48px touch targets, visible focus rings, `aria-live` announcements, no text below 12px, `active:scale-95`-style tactile feedback on every control.
- **Safe areas:** `env(safe-area-inset-*)` padding on navbar and tab bar.
- **Offline:** all ledger data persists in `localStorage`; the shell is cached by the service worker.
