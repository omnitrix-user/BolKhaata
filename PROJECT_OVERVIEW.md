# BolKhaata — Project Overview

**Tagline:** *आपका खाता, आपकी आवाज़* — a voice-first *khata* (ledger) app for Indian kirana/micro-vendors.

A shopkeeper registers a shop, then records ledger entries by **speaking** (Hindi / Kannada / Hinglish) — e.g. *"Suresh ko 200 rupaye udhaar"*. The app transcribes the speech, parses the intent, resolves it to the right customer, and books a credit/payment. It also generates GST invoice PDFs/images and sends WhatsApp payment reminders.

> Last updated to reflect the rebuild + voice-engine fixes (commits `fa096fc`, `83bac8d`).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 (PWA), trilingual UI, plain CSS |
| Backend | FastAPI (Python 3.13), Uvicorn |
| Database | SQLite (`bolkhaata.db`, local file, gitignored) |
| Auth | PIN (PBKDF2-HMAC-SHA256) + opaque shop token in `X-Shop-Token` header |
| Speech-to-text | Browser Web Speech API (client) + optional OpenAI Whisper (server) |
| Intent parsing | OpenRouter LLM with an offline regex/Hindi-number **fallback** |
| Invoices | ReportLab (PDF) + Pillow/qrcode (JPG with UPI QR) |
| Reminders | `wa.me` deep links (default) + optional Twilio WhatsApp |

Every external integration is **optional** — with no API keys the app still works (on-device speech, heuristic parser, `wa.me` links).

---

## Repository layout

```
BolKhaata/
├── backend/
│   ├── main.py               # FastAPI app + all routes
│   ├── auth.py               # PIN hashing + X-Shop-Token shop resolution
│   ├── database.py           # SQLite schema, migrations, data access
│   ├── models.py             # Pydantic request models
│   ├── intent_parser.py      # LLM intent parse + offline heuristic fallback
│   ├── stt.py                # OpenAI Whisper transcription (optional)
│   ├── invoice_generator.py  # ReportLab GST invoice PDF
│   ├── invoice_image.py      # Pillow JPG invoice (UPI QR)
│   ├── whatsapp.py           # wa.me links + optional Twilio
│   ├── test_resolution.py    # runnable tests (customer resolution rules)
│   └── requirements.txt
├── frontend/
│   ├── index.html, vite.config.js, package.json
│   ├── public/               # manifest.webmanifest, sw.js, icons
│   └── src/
│       ├── App.jsx           # shell: tabs, overlays, voice mount
│       ├── api.js            # fetch client (token, error handling)
│       ├── i18n.js           # hi / kn / en strings
│       ├── components/       # VoiceAssistant, InvoicePreview, Icons, Toast
│       ├── lib/              # commands (voice matcher), useSpeech, format, share
│       └── screens/          # Onboarding, Home, Ledger, CustomerDetail,
│                             #   Invoices, InvoiceCreate, Settings
└── pwa/                       # SEPARATE standalone vanilla-JS PWA prototype
```

> `pwa/` is an independent design prototype (vanilla HTML/CSS/JS) and is **not** part of the React app — see `pwa/README.md`.

---

## Frontend architecture

- **Shell** ([`App.jsx`](frontend/src/App.jsx)): holds `shop` (auth), the active `tab`, and an `overlay`/`voice` stack. Unauthenticated users see `Onboarding`; authenticated users get a bottom nav (Home · Khata · Bill · Settings) with a centre **mic** button.
- **Screens** (in `src/screens/`): Home (dashboard + mic + type box), Ledger (customer list + search), CustomerDetail (history, add entry, settle, remind), Invoices (list, preview, delete), InvoiceCreate (line-item builder), Settings, Onboarding.
- **Overlays**: CustomerDetail, InvoiceCreate, and a global **InvoicePreview** (so voice can open a specific invoice from anywhere).
- **Voice pipeline** ([`VoiceAssistant.jsx`](frontend/src/components/VoiceAssistant.jsx)): record → review/edit transcript → route. Commands ([`lib/commands.js`](frontend/src/lib/commands.js)) are matched first (entity-aware actions); otherwise the transcript goes to the LLM/heuristic parser and becomes a khata or invoice draft. Duplicate-name matches force a disambiguation step.
- **Speech** ([`lib/useSpeech.js`](frontend/src/lib/useSpeech.js)): Web Speech API wrapper that settles exactly once (no false "didn't catch that").
- **i18n**: every label is `{hi, kn, en}`; language stored in `localStorage`.
- **Client** ([`api.js`](frontend/src/api.js)): adds the `X-Shop-Token` header, clears auth on 401, base URL auto-targets `host:8000`.

## Backend architecture

- **Flat FastAPI app** ([`main.py`](backend/main.py)); each concern isolated in its own module.
- **Auth** ([`auth.py`](backend/auth.py)): shops register with a PIN (stored as PBKDF2 hash) and receive an opaque token; `require_shop` resolves the token on every protected route. The token rotates on each login.
- **Identity model**: everything is scoped to a `shop_id`. **Customers are first-class rows with integer ids; duplicate names are allowed.** Transactions/invoices reference `customer_id` (with the name denormalised for display).
- **Resolution rules** (see [API_FLOW.md](API_FLOW.md)): names auto-resolve **exactly** only; ambiguity forces a choice; fuzzy matching exists only behind an explicit search.
- **Graceful degradation**: missing keys → on-device fallbacks, never errors.

See [DATABASE.md](DATABASE.md) for schema and [API_FLOW.md](API_FLOW.md) for endpoints, auth, and flows.

---

## Environment (`backend/.env`, all optional)

| Variable | Used by | Unlocks |
|----------|---------|---------|
| `OPENROUTER_API_KEY` / `LLM_MODEL` | `intent_parser.py` | better intent parsing (else heuristic) |
| `OPENAI_API_KEY` | `stt.py` | server Whisper STT (else browser speech) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | `whatsapp.py` | auto-send reminders (else `wa.me` link) |
| `CORS_ORIGINS` | `main.py` | restrict origins (else localhost + LAN) |

## Run

```bash
# Backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload            # http://localhost:8000

# Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```
