# BolKhaata — बोलखाता

**Aapka khata, aapki awaaz.** A voice-first PWA for Indian kirana stores and street
vendors to log udhaar (credit), track payments, and generate GST invoices — all by
speaking in Hindi / Kannada / Hinglish.

- **Frontend:** React + Vite (installable PWA, mobile-first, Hindi-first bilingual)
- **Backend:** FastAPI + SQLite (PIN auth, per-shop data isolation)
- **Voice:** browser-native **Web Speech API** (free, on-device, Android Chrome)
  for speech→text → OpenRouter/DeepSeek for intent parsing, with an offline
  regex + Hindi-number fallback so it works with **zero API keys**
- **WhatsApp:** free `wa.me` deep links (opens the vendor's own WhatsApp; Twilio optional)
- **Invoices:** ReportLab GST tax invoices with CGST/SGST split + seller GSTIN
- **Languages:** trilingual UI — हिंदी / ಕನ್ನಡ / English; voice in Hindi/Kannada/Hinglish

## Features

- 🎙️ **Speak to log** — "Suresh ko teen sau rupaye udhaar" → confirm card → saved
- ⌨️ **Type fallback** — works even without a microphone or STT key
- 📒 **Khata ledger** — customers with red (owes) / green (advance) balances, search
- 👤 **Customer detail** — full history, settle-up, add credit/payment, call, WhatsApp remind
- 🧾 **GST invoices** — voice or manual, real CGST/SGST, share on WhatsApp / download PDF
- 🏪 **Single-shop or Multi-shop** login modes with PIN auth
- 📊 **Home dashboard** — total receivable, today's credit/payment, due customers
- 📱 **Installable PWA** — add to home screen, offline app shell
- 🇮🇳 **Hindi-first UI** with English toggle (Devanagari + Inter fonts)

## Quick start

```bash
# 1) Backend  (http://localhost:8000)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional: add API keys to unlock voice
uvicorn main:app --reload

# 2) Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**, choose Single/Multi shop, create your shop, and start
speaking. To test on a phone, run the frontend with `npm run dev -- --host` and open
`http://<your-computer-ip>:5173` on a phone on the same wifi (the app auto-targets the
backend on the same host:8000).

## Environment variables

All keys are **optional** — see `backend/.env.example`. The app degrades gracefully:

| Key | Unlocks | Without it |
|-----|---------|-----------|
| `OPENROUTER_API_KEY` | Best Hindi/Kannada/Hinglish intent parsing | Built-in offline heuristic parser |
| `TWILIO_*` | Auto-send WhatsApp reminders | Free `wa.me` deep links (recommended) |

Speech-to-text uses the **browser's built-in Web Speech API** (no key, works on
Android Chrome). On browsers without it, the "type instead" box is used. The
optional `OPENAI_API_KEY` (Whisper) hook remains in the backend but is unused by default.

## Reset data

Delete `backend/bolkhaata.db` to start with a fresh, empty database.

## Project layout

```
backend/   FastAPI app — auth, ledger, invoices, voice, whatsapp
frontend/  React PWA — screens/, components/, lib/, i18n
```
