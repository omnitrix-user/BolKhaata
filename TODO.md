# BolKhaata — TODO, Missing Features & Bugs

Status as of 2026-06-13. Findings from a full read of the codebase.
**Update 2026-06-13:** the 5 headline bugs below have been fixed (✅).

---

## 🔴 Bugs

1. ✅ **FIXED — `python main.py` does not start the server.**
   `main.py` only defined `app` with no `__main__` runner. **Fix applied:** added an
   `if __name__ == "__main__": uvicorn.run("main:app", ..., reload=True)` block (host/port
   from `HOST`/`PORT` env). `python3 main.py` now boots the server.
   *(Note: on this machine the command is `python3`, not `python`.)*

2. ✅ **FIXED — Ledger "due" highlight was inverted.**
   The red `customer-balance--due` class was applied on `balance > 0`, but debtors have a
   **negative** balance. **Fix applied:** [`App.jsx`](frontend/src/App.jsx) now uses a
   `balanceLabel()` helper that shows `₹X due` (red) when `balance < 0`, `₹X advance` when
   `> 0`, and `Settled` at zero.

3. ✅ **FIXED — No manual entry path.**
   **Fix applied:** added an **"Add"** tab with a typed form (name, amount, credit/payment
   toggle, note, phone) that POSTs straight to `/log-transaction`. The app is now usable with
   no API keys at all. (A "or add an entry manually" link also sits under the mic.)

4. ✅ **FIXED — Invoice flow was dead-ended in the UI.**
   **Fix applied:** an `invoice` intent now opens an invoice card (item list + customer-name
   field) that calls `/generate-invoice` and downloads the returned PDF.

5. ✅ **FIXED — WhatsApp reminders + customer detail unreachable from the UI.**
   **Fix applied:** tapping a customer row opens a detail modal (transaction history wired to
   `GET /ledger/{name}`) with a **Send WhatsApp reminder** button (phone field) that calls
   `/send-reminder` for debtors.

### Still open

6. **Deprecated FastAPI startup hook.**
   `@app.on_event("startup")` is deprecated; should migrate to a `lifespan` handler.

7. **`favicon.ico` 404s.** Browser requests `/favicon.ico` from the API origin (logged 404). Harmless but noisy; `index.html` references `favicon.svg`.

8. **Pre-existing lint error** in `App.jsx`: `processRecording` is referenced inside
   `startRecording` before its declaration (works at runtime via closure, but the new
   `react-hooks/immutability` rule flags it). Reorder/`useCallback` to silence.

---

## 🟠 Security / hardening (see API_FLOW.md)

- ✅ **Authentication — addressed (opt-in).** Added an `X-API-Token` shared-secret gate in
  [`main.py`](backend/main.py): set `API_TOKEN` in `backend/.env` to require it on every route
  except `/health`. **Off by default** so local dev is unchanged; the frontend sends the token
  from `VITE_API_TOKEN` when present. Not a full per-user login — see multi-tenancy below.
- ✅ **Config-driven origins.** API base URL is now `VITE_API_URL` (frontend) and CORS origins
  come from `CORS_ORIGINS` (backend), both with localhost defaults.
- **No multi-tenancy** — one shared ledger, no per-shop scoping / real user accounts.
- **No rate limiting** on endpoints that call paid APIs (`/transcribe`, `/parse-intent`, `/generate-invoice`, `/send-reminder`) → cost/abuse risk if exposed.
- **No input validation/size limits** on uploaded audio or invoice payloads.
- **`bolkhaata.db` is committed to git** with test data; should be gitignored.

---

## 🟡 Missing features

- Manual/typed transaction entry (fallback for no-mic / no-keys).
- Customer detail screen (wire up `/ledger/{name}`).
- Invoice builder UI (wire up `/generate-invoice`, show/download the returned PDF).
- "Send reminder" button on debtor rows (wire up `/send-reminder`).
- Edit / delete transactions (currently insert-only; no correction path).
- A real customers table (phone, name normalization, dedupe) instead of name-as-key.
- Persisted invoice line items (only the total is stored today).
- Search / filter / sort in the ledger.
- PWA install support / offline (README calls it a "PWA" but there is no manifest or service worker).
- Tests — there are none for backend or frontend.

---

## 🟢 Nice-to-have / tech debt

- Add an index on `transactions.customer_name`.
- Add DB migrations (e.g. Alembic) instead of `CREATE TABLE IF NOT EXISTS`.
- Store ISO dates (sortable) alongside the human-readable `date` string.
- Centralize the frontend API base URL into an env-driven config / API client module.
- `requirements.txt` is complete, but the **README's install step is not** (`pip install fastapi uvicorn` omits openai, reportlab, twilio, httpx, etc.). Use `pip install -r requirements.txt`.
- Cache or incrementally update balances if transaction volume grows.

---

## Setup notes (current, verified)

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# create backend/.env with OPENAI_API_KEY / OPENROUTER_API_KEY (and Twilio if used)
python3 -m uvicorn main:app --reload      # NOT `python main.py`

# Frontend
cd frontend
npm install
npm run dev                                # http://localhost:5173
```
