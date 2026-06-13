<div align="center">

# बोलखाता · BolKhaata

### *आपका खाता, आपकी आवाज़* — Your ledger, your voice

A **voice-first Progressive Web App** that lets Indian kirana stores and street vendors
keep their *khata* (credit ledger), track payments, and raise GST invoices — just by
**speaking**, in Hindi, Kannada, or Hinglish.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)
![Works offline](https://img.shields.io/badge/API_keys-optional-success)

</div>

---

## Table of contents

- [Why BolKhaata](#why-bolkhaata)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Voice commands](#voice-commands)
- [How customer matching works](#how-customer-matching-works)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Deployment notes](#deployment-notes)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Roadmap](#roadmap)

---

## Why BolKhaata

India's smallest shopkeepers track credit in paper *bahi-khatas*. Existing apps assume
typing English on a smartphone — a poor fit for a busy vendor with one hand on the scale.

BolKhaata is built around **voice as the primary input**, in the languages vendors
actually speak, and around the realities of their environment:

- **Speak, don't type** — *"Suresh ko teen sau rupaye udhaar"* logs ₹300 credit to Suresh.
- **Works with zero API keys** — on-device speech recognition + an offline Hindi-number
  parser mean it runs on a budget Android phone with a flaky connection.
- **Trilingual** — the entire UI is हिंदी / ಕನ್ನಡ / English; voice understands
  Hindi / Kannada / Hinglish, code-mixed and Romanized.
- **Installable PWA** — "Add to Home Screen" and it behaves like a native app, offline shell included.

---

## Features

| Area | What you get |
|------|--------------|
| 🎙️ **Voice ledger** | Speak an entry → review → save. Credit/payment auto-detected from natural phrasing. |
| ⌨️ **Type fallback** | Full manual entry everywhere — works with no mic or STT key. |
| 🗣️ **Action voice commands** | *"Open Rahul's khata"*, *"Open the last invoice of Rahul"*, *"Naya khata kholo Rahul"* — commands **complete the task**, not just navigate. |
| 📒 **Khata ledger** | Searchable customer list with red (owes) / green (advance) balances. |
| 👥 **Duplicate-safe customers** | Multiple customers can share a name; each is a distinct identity, disambiguated by phone. |
| 👤 **Customer detail** | Full history, add credit/payment, settle-up, one-tap call, WhatsApp reminder. |
| 🧾 **GST invoices** | Build by voice or form → ReportLab PDF + a shareable JPG with a UPI payment QR. |
| 📲 **WhatsApp reminders** | Free `wa.me` deep links by default; optional Twilio auto-send. |
| 📊 **Dashboard** | Total receivable, today's credit/payment, count of customers who owe. |
| 🔐 **PIN auth** | Per-shop accounts with PBKDF2-hashed PINs; single-shop or multi-shop modes. |
| 📱 **PWA** | Manifest, service worker, offline app shell, home-screen install. |

---

## Architecture

```
┌──────────────────────────────┐         ┌─────────────────────────────────────┐
│   Frontend — React 19 PWA      │         │   Backend — FastAPI (Python 3.13)    │
│                                │         │                                     │
│  Onboarding · Home · Ledger    │  HTTPS  │  /auth   PIN + X-Shop-Token          │
│  CustomerDetail · Invoices     │ ◄─────► │  /ledger /customer* /log-transaction │
│  InvoiceCreate · Settings      │  JSON   │  /generate-invoice /send-reminder    │
│                                │         │  /parse-intent /transcribe           │
│  VoiceAssistant ── Web Speech  │         │                                     │
│  api.js (token) · i18n (3 lang)│         │  auth · database · intent_parser     │
└──────────────────────────────┘         │  invoice_generator/_image · whatsapp │
                                          └──────────────┬──────────────────────┘
        optional, graceful fallbacks                     │
   ┌──────────────┬───────────────┬─────────────┐        ▼
   │ OpenRouter   │ OpenAI Whisper │  Twilio     │   ┌─────────────┐
   │ (intent LLM) │ (server STT)   │  (WhatsApp) │   │   SQLite    │
   └──────────────┴───────────────┴─────────────┘   │ bolkhaata.db│
   each optional → on-device / heuristic fallback     └─────────────┘
```

**Design principles**

- **Graceful degradation.** Every third-party integration is optional; with no keys the
  app falls back to browser speech, a regex/Hindi-number intent parser, and `wa.me` links.
- **Identity by id, not name.** Customers are first-class rows; duplicate names are allowed
  and never silently merged (see [How customer matching works](#how-customer-matching-works)).
- **Multi-tenant.** Every row is scoped to a `shop_id`; a token resolves the shop per request.

> A separate, self-contained design prototype lives in [`pwa/`](pwa/) (vanilla HTML/CSS/JS).
> It is **not** part of the React app — see [`pwa/README.md`](pwa/README.md).

---

## Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | **React 19 + Vite 8** | mobile-first PWA, no router (overlay/tab state), plain CSS |
| Backend | **FastAPI + Uvicorn** | flat route module, Pydantic models |
| Database | **SQLite** | single local file, raw `sqlite3`, additive migrations on startup |
| Auth | **PBKDF2-HMAC-SHA256** PIN + opaque `X-Shop-Token` | per-shop isolation |
| Speech→text | **Web Speech API** (client) | optional server **OpenAI Whisper** |
| Intent parsing | **OpenRouter LLM** (DeepSeek default) | offline regex + Hindi-number fallback |
| Invoices | **ReportLab** (PDF) + **Pillow / qrcode** (JPG + UPI QR) | CGST/SGST split |
| Reminders | **`wa.me`** deep links | optional **Twilio** WhatsApp |
| i18n | hand-rolled `{hi, kn, en}` dictionary | language persisted in `localStorage` |

---

## Getting started

### Prerequisites

- **Python 3.11+** (developed on 3.13)
- **Node.js 18+** and npm
- A **Chromium-based browser** (Chrome/Edge/Brave) for voice — Web Speech works best there.

### 1 · Backend → http://localhost:8000

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional — add keys to unlock LLM/Twilio
uvicorn main:app --reload
```

### 2 · Frontend → http://localhost:5173

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**, create a shop (phone + PIN), and start speaking.

### Test on a real phone (same Wi-Fi)

```bash
npm run dev -- --host        # then open http://<your-computer-ip>:5173 on the phone
```

The frontend auto-targets the backend at `http://<same-host>:8000`, so the phone reaches
your machine's API with no extra config.

---

## Configuration

All keys live in `backend/.env` and are **optional** (see [`backend/.env.example`](backend/.env.example)):

| Variable | Unlocks | Without it |
|----------|---------|------------|
| `OPENROUTER_API_KEY`, `LLM_MODEL` | Best Hindi/Kannada/Hinglish intent parsing | Built-in offline heuristic parser |
| `OPENAI_API_KEY` | Server-side Whisper STT | Browser Web Speech API (default) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | Auto-send WhatsApp reminders | Free `wa.me` deep links |
| `CORS_ORIGINS` | Restrict allowed origins (comma-separated) | localhost + LAN IPs allowed |

> **Speech-to-text** uses the browser's built-in Web Speech API by default (no key, best on
> Android Chrome). Browsers without it fall back to the "type instead" box.

---

## Voice commands

After tapping the mic you can speak an **entry** or a **command**. Commands are matched
first; anything else is parsed as a transaction/invoice.

| Intent | Say (examples) | Result |
|--------|----------------|--------|
| Log credit | "Suresh ko 300 rupaye udhaar" · "राहुल को दो सौ उधार" | Credit booked after a confirm card |
| Log payment | "Imran ne 500 jama kiya" · "paid 200 by Sunita" | Payment booked |
| Open a khata | "Open Rahul's khata" · "राहुल का खाता खोलो" | Opens that customer's ledger |
| Open last invoice | "Open the last invoice of Rahul" | Opens the newest invoice image |
| New khata | "Naya khata kholo Rahul" · "create a new account for Rahul" | Creates a **fresh** ledger, even if a Rahul exists |
| Navigate | "show invoices" · "open settings" | Switches screen |

If a spoken name matches **more than one** customer, the app pauses and asks *which one*
(showing name · phone · balance) — it never guesses.

---

## How customer matching works

This is core to correctness, so it's explicit by design:

- **Exact match only** for auto-resolution. *"Udayveer Singh"* will **never** be booked to an
  existing *"Udayveer"* — they are different identities.
- **One exact match** → used. **Zero** → a new khata is created. **Two or more** → the app
  **must** ask which customer (mandatory disambiguation; never a silent pick).
- **Names are not unique.** Three different "Rahul"s can coexist, each with its own id, phone,
  and independent balance.
- **Fuzzy search** exists only behind the explicit search box / `/customers/search` — never
  for auto-resolution.

---

## Testing

Both suites are dependency-free and runnable directly:

```bash
# Backend — customer resolution & khata rules (17 checks)
cd backend && python3 test_resolution.py

# Frontend — voice command parsing (13 checks)
cd frontend && node src/lib/commands.test.mjs
```

They cover the high-value scenarios: *Udayveer vs Udayveer Singh*, multiple *Rahul* entries,
duplicate-khata creation, balance isolation, open-last-invoice, and command parsing.

---

## Project structure

```
.
├── backend/
│   ├── main.py               # FastAPI app + all routes
│   ├── auth.py               # PIN hashing + X-Shop-Token resolution
│   ├── database.py           # SQLite schema, migrations, data access
│   ├── models.py             # Pydantic request models
│   ├── intent_parser.py      # LLM intent parse + offline heuristic fallback
│   ├── stt.py                # OpenAI Whisper (optional)
│   ├── invoice_generator.py  # ReportLab GST PDF
│   ├── invoice_image.py      # Pillow JPG + UPI QR
│   ├── whatsapp.py           # wa.me links + optional Twilio
│   ├── test_resolution.py    # runnable backend tests
│   └── requirements.txt
├── frontend/
│   ├── public/               # manifest.webmanifest, sw.js, icons
│   └── src/
│       ├── App.jsx           # shell: tabs, overlays, voice mount
│       ├── api.js            # fetch client (token + error handling)
│       ├── i18n.js           # hi / kn / en strings
│       ├── components/       # VoiceAssistant, InvoicePreview, Icons, Toast
│       ├── lib/              # commands, useSpeech, format, share
│       └── screens/          # Onboarding, Home, Ledger, CustomerDetail,
│                             #   Invoices, InvoiceCreate, Settings
├── pwa/                       # standalone vanilla-JS prototype (separate app)
├── PROJECT_OVERVIEW.md · DATABASE.md · API_FLOW.md · TODO.md
└── README.md
```

---

## Deployment notes

- **Frontend:** `npm run build` emits a static bundle in `frontend/dist/` — host on any
  static/CDN target. Set `VITE_API_URL` at build time to point at your API.
- **Backend:** run `uvicorn main:app` behind a reverse proxy (HTTPS strongly recommended,
  since speech recognition and PWA install require a secure context).
- **CORS:** set `CORS_ORIGINS` to your deployed frontend origin(s).
- **Data:** `bolkhaata.db` is a local file (gitignored). Back it up / mount it on a volume.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Mic does nothing / "voice unavailable" | Use Chrome/Edge over `https` or `localhost`; some browsers (e.g. Brave) disable the speech backend — use the type box. |
| Phone can't reach the API | Start the frontend with `--host`, ensure both devices share Wi-Fi, and that port `8000` isn't firewalled. |
| `401` / logged out unexpectedly | The session token rotates on each login — logging in elsewhere ends other sessions. Log in again. |
| Want a clean slate | Stop the server and delete `backend/bolkhaata.db`; it's recreated empty on next start. |

---

## Documentation

| Doc | Contents |
|-----|----------|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | Architecture, stack, repo layout, environment |
| [DATABASE.md](DATABASE.md) | Schema, balance convention, data-access functions |
| [API_FLOW.md](API_FLOW.md) | Auth, every endpoint, resolution rules, voice flow |
| [TODO.md](TODO.md) | Status, known issues, roadmap |

---

## Roadmap

Tracked in [TODO.md](TODO.md). Highlights still open: timezone-correct "today" totals,
multi-device sessions, editable transactions, customer merge/rename, and tightened
file-token handling. Recently shipped: exact-match resolution, duplicate-name support,
action voice commands, and per-shop PIN auth.

---

<div align="center">
<sub>Built for the vendors who keep India's neighbourhoods running. 🪔</sub>
</div>
