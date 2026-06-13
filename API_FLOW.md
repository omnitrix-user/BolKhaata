# BolKhaata — API & Flows

Base URL (dev): `http://localhost:8000`
Defined in [`backend/main.py`](backend/main.py). CORS allows only `http://localhost:5173`.

---

## Endpoints

### `GET /health`
Liveness probe. → `{"status": "ok"}`

### `POST /transcribe`
Speech-to-text.
- **Body:** `multipart/form-data` with field `audio` (the recorded blob).
- **Calls:** OpenAI Whisper (`whisper-1`) via [`stt.py`](backend/stt.py).
- **Returns:** `{"transcript": "<text>"}`. Returns `""` if `OPENAI_API_KEY` is unset or the call fails (never errors).

### `POST /parse-intent`
Classify a transcript into a structured intent.
- **Body:** `{"transcript": "Ramesh ko 200 udhaar"}`
- **Calls:** OpenRouter LLM via [`intent_parser.py`](backend/intent_parser.py).
- **Returns one of:**
  - `{"type":"khata","data":{customer_name, amount, txn:"credit"|"payment", note, phone}}`
  - `{"type":"invoice","data":{items:[{name, qty, rate, gst}]}}`
  - `{"type":"unknown","data":{}}` (also returned on any failure or missing `OPENROUTER_API_KEY`).

### `POST /log-transaction`
Record a ledger entry.
- **Body** (`KhataEntry`): `{customer_name, amount, type:"credit"|"payment", note?, date?, phone?}`
- If `date` is empty, the server fills `"%d %b"` (e.g. `"13 Jun"`).
- **Returns:** `{"success": true, "balance": <new signed balance>}`.

### `GET /ledger`
All customers with balances. → `{"customers":[{name, balance}, ...]}`

### `GET /ledger/{name}`
One customer's history. → `{"transactions":[{amount, type, note, date}, ...], "balance": <signed>}` (newest first).

### `POST /generate-invoice`
Build + persist a GST invoice PDF.
- **Body** (`Invoice`): `{invoice_id?, customer_name, items:[{name, qty, rate, gst}], total?, date?}`
- **Calls:** [`invoice_generator.py`](backend/invoice_generator.py) (ReportLab), then `database.save_invoice`.
- **Returns:** the **PDF file** (`application/pdf`) with custom headers `X-Invoice-Id`, `X-Invoice-Total`, `X-Invoice-Url` (exposed via CORS).

### `GET /invoice/{invoice_id}`
Fetch a previously generated PDF by id from `backend/invoices/`. → PDF, or `404 {"error":"not found"}`.

### `POST /send-reminder`
Send a WhatsApp payment reminder.
- **Body** (`ReminderIn`): `{customer_name, phone?, amount}`
- **Calls:** Twilio via [`whatsapp.py`](backend/whatsapp.py).
- **Returns:** `{"success": <bool>}` — `false` if Twilio creds or phone are missing (never errors).

---

## Primary user flow — voice entry

```
[User taps mic]
      │  MediaRecorder captures audio/webm
      ▼
POST /transcribe ──► OpenAI Whisper ──► transcript text
      ▼
POST /parse-intent ──► OpenRouter LLM ──► {type, data}
      │
      ├─ type == "khata"  ──► UI confirm card ──► POST /log-transaction ──► new balance ──► "Saved!"
      ├─ type == "invoice"──► UI: "coming soon" (NOT wired to /generate-invoice)
      └─ type == "unknown"──► UI error: "Could not understand"
```

## Ledger flow
```
[User opens Khata tab] ──► GET /ledger ──► render customer list with balances
```
(`GET /ledger/{name}` exists in the backend but the **UI never calls it** — there is no customer detail screen yet.)

---

## Authentication & security

**There is none.** Every endpoint is fully open:

- No login, no API keys, no tokens, no sessions, no per-user/per-shop scoping.
- Anyone who can reach the server can read the entire ledger, write transactions, generate invoices, and trigger WhatsApp messages.
- `/transcribe`, `/parse-intent`, `/generate-invoice`, and `/send-reminder` proxy to **paid third-party APIs** with no rate limiting or auth — an open `/send-reminder` or `/transcribe` is an abuse/cost risk if exposed publicly.
- This is acceptable for a single-user local prototype only. Before any real deployment, add authentication, per-shop data scoping, input validation/limits, and rate limiting. Tracked in [TODO.md](TODO.md).

---

## Integration touchpoints

| Module | Service | Failure mode |
|--------|---------|--------------|
| `stt.py` | OpenAI Whisper | Returns `""`; UI shows "Could not understand" |
| `intent_parser.py` | OpenRouter LLM | Returns `{"type":"unknown"}` |
| `invoice_generator.py` | ReportLab (local) | Raises on bad input (no guard) |
| `whatsapp.py` | Twilio | Returns `False`; never raises |
