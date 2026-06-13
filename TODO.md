# BolKhaata — TODO, Status & Known Issues

Reflects the current code (rebuild `fa096fc` + voice fixes `83bac8d`).

---

## ✅ Done (previously open, now resolved)

- **Authentication** — per-shop PIN auth + `X-Shop-Token`; all data scoped to `shop_id`.
- **Manual entry** — typed/edit flows on Home, CustomerDetail, InvoiceCreate (no longer voice-only).
- **Invoice flow** — full builder, PDF + JPG (UPI QR), list, preview, delete, WhatsApp share.
- **Reminders** — wired (CustomerDetail → `wa.me` link / optional Twilio).
- **Customer detail** — history, add credit/payment, settle-up, call, add phone.
- **Customers are first-class ids; duplicate names supported.**
- **Exact customer matching** — partial names no longer auto-resolve ("Udayveer Singh" ≠ "Udayveer").
- **Duplicate-name disambiguation** — 2+ exact matches force a chooser; never a silent pick.
- **"Open a new khata for X"** — always creates a fresh ledger.
- **Action voice commands** — open khata / open last invoice / add txn / create khata actually complete.
- **False "Didn't catch that"** — `useSpeech` settles once and ignores its own `abort()`.
- **DB hygiene** — `bolkhaata.db` gitignored; indexes added; offline fallbacks for STT/LLM/WhatsApp.
- **Tests** — `backend/test_resolution.py` (17), `frontend/src/lib/commands.test.mjs` (13).

---

## 🔴 Open bugs

1. **Timezone-wrong "today" totals.** `summary()` compares local `datetime.now()`
   to UTC `date(created_at)` — today's credit/payment can be wrong near midnight
   / outside UTC. ([database.py](backend/database.py))
2. **Login kicks other devices.** `rotate_token` on every login = one active
   session per shop. ([main.py](backend/main.py) `/auth/login`)
3. **Settings → street_vendor doesn't zero GST.** `gst_rate=0` is forced only in
   `create_shop`, not `update_shop`.
4. **`@app.on_event("startup")` deprecated** — migrate to a `lifespan` handler.

---

## 🟠 Security / hardening

- **Token in invoice file URLs** (`?token=`) — leaks into logs/history/referrer.
- **Dead header param** — `_auth_for_file`'s `x_shop_token` is parsed as a query
  value (no `Header()`); only `?token=` actually works.
- **No rate limiting** on routes hitting paid APIs (`/transcribe`, `/parse-intent`,
  `/generate-invoice`, `/send-reminder`).
- **No upload/size limits** on audio or invoice payloads.
- **No `amount > 0` server validation** on `/log-transaction` (frontend checks only).

---

## 🟡 Missing features / nice-to-have

- Edit (not just delete) transactions.
- Customer merge (combine duplicates created in error) + rename.
- ISO date column alongside the human `date` string (for sortable/range queries).
- Voice "search customer / search invoice" wired to in-app search results.
- Schema-version migrations framework (currently additive `ALTER`/rebuild in `init_db`).
- Pre-existing `react-hooks/immutability` lint warnings in a couple of components.

---

## Notes

- The `pwa/` folder is a **separate** standalone prototype (vanilla JS), not the
  React app — keep that in mind when triaging UI issues.
- Both test suites run without any framework:
  `python3 backend/test_resolution.py` · `node frontend/src/lib/commands.test.mjs`.
