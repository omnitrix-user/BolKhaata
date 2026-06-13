# BolKhaata — Project Overview

**Tagline:** *Bol ke likho* — a voice-first *khata* (ledger) app for Indian kirana/small shop owners.

A shopkeeper taps a mic, speaks an entry in Hindi/Kannada (often Romanized/code-mixed) like *"Ramesh ko 200 rupaye udhaar"*, and the app transcribes it, understands the intent, and records it in a customer ledger. It can also generate GST invoice PDFs and send WhatsApp payment reminders.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 (PWA-style SPA), plain CSS |
| Backend | FastAPI (Python 3.13), Uvicorn |
| Database | SQLite (`bolkhaata.db`, local file) |
| Speech-to-text | OpenAI Whisper (`whisper-1`) |
| Intent parsing | LLM via OpenRouter (default `deepseek/deepseek-chat`) |
| Invoices | ReportLab (PDF generation) |
| Reminders | Twilio WhatsApp API |

---

## Repository layout

```
BolKhaata/
├── README.md
├── backend/
│   ├── main.py               # FastAPI app + all routes
│   ├── models.py             # Pydantic request/response models
│   ├── database.py           # SQLite access layer + schema
│   ├── intent_parser.py      # LLM call to classify transcript → khata/invoice
│   ├── stt.py                # OpenAI Whisper transcription
│   ├── invoice_generator.py  # ReportLab GST invoice PDF builder
│   ├── whatsapp.py           # Twilio WhatsApp reminder sender
│   ├── requirements.txt
│   └── bolkhaata.db           # SQLite database (committed)
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx          # React entry
        ├── App.jsx           # Entire UI (voice + ledger tabs)
        ├── App.css / index.css
        └── assets/
```

---

## Frontend architecture

- **Single-component SPA.** All UI logic lives in [`frontend/src/App.jsx`](frontend/src/App.jsx). There is no router, no state-management library, and no API-client module — `fetch` calls hit the backend at the hardcoded `const API = 'http://localhost:8000'`.
- **Two tabs** driven by a `tab` state value, with a bottom navigation bar:
  - **Voice** — the primary screen. A mic button drives a small state machine.
  - **Khata (ledger)** — a read-only list of customers and their balances.
- **Voice state machine** (`phase` state): `idle → recording → processing → confirm → success` (with `idle` on errors). Flow:
  1. `startRecording` uses the browser `MediaRecorder` API to capture `audio/webm;codecs=opus`.
  2. On stop, the blob is POSTed to `/transcribe`.
  3. The returned transcript is POSTed to `/parse-intent`.
  4. If intent is `khata`, the app shows a **confirm card**; on confirm it POSTs to `/log-transaction` and shows the new balance.
  5. If intent is `invoice`, it shows *"invoice flow coming soon"* (not implemented in UI).
- **Currency formatting** via `Intl.NumberFormat('en-IN', INR)`.
- Built with React **StrictMode** ([`main.jsx`](frontend/src/main.jsx)).

## Backend architecture

- **Flat FastAPI app.** [`backend/main.py`](backend/main.py) defines all routes directly; each external concern is isolated in its own module (`stt`, `intent_parser`, `invoice_generator`, `whatsapp`, `database`).
- **Graceful degradation by design.** Every external integration (Whisper, OpenRouter, Twilio) returns an empty/`unknown`/`False` result instead of raising when its API key is missing or a call fails. The server therefore boots and serves requests even with **no API keys configured** — but voice and reminders silently do nothing.
- **CORS** is locked to `http://localhost:5173` (the Vite dev origin).
- **Config** is read from environment variables, loaded from `backend/.env` via `python-dotenv`. No `.env` is committed (it is gitignored).
- **Persistence** is a single local SQLite file; the schema is created on startup via `database.init_db()`.

---

## Request → response flows (summary)

| User action | Endpoints hit | External service |
|-------------|---------------|------------------|
| Speak an entry | `/transcribe` → `/parse-intent` → `/log-transaction` | OpenAI Whisper, OpenRouter LLM |
| View ledger | `/ledger` | — |
| Generate invoice | `/generate-invoice` (no UI yet) | ReportLab |
| Send reminder | `/send-reminder` (no UI yet) | Twilio |

See [API_FLOW.md](API_FLOW.md) for details and [DATABASE.md](DATABASE.md) for the schema.

---

## Required environment variables (`backend/.env`)

| Variable | Used by | Required for |
|----------|---------|--------------|
| `OPENAI_API_KEY` | `stt.py` | Voice transcription |
| `OPENROUTER_API_KEY` | `intent_parser.py` | Understanding the transcript |
| `LLM_MODEL` | `intent_parser.py` | (optional) override default model |
| `TWILIO_ACCOUNT_SID` | `whatsapp.py` | WhatsApp reminders |
| `TWILIO_AUTH_TOKEN` | `whatsapp.py` | WhatsApp reminders |
| `TWILIO_WHATSAPP_FROM` | `whatsapp.py` | (optional) sender number |

> Without `OPENAI_API_KEY` **and** `OPENROUTER_API_KEY`, the voice flow cannot produce a transaction — and since the UI has no manual-entry form, the ledger cannot be populated through the app. See [TODO.md](TODO.md).
