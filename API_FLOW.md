# BolKhaata — API & Flows

Base URL (dev): `http://localhost:8000` · defined in [`backend/main.py`](backend/main.py).
CORS: `CORS_ORIGINS` env or default localhost + LAN IPs.

## Authentication

- A shop **registers** with a phone + PIN and receives an opaque **token**.
- Protected routes require that token in the **`X-Shop-Token`** header (resolved by `auth.require_shop` → the `shop` row). Missing/invalid → `401`.
- PINs are stored as PBKDF2-HMAC-SHA256 hashes; the token **rotates on each login**.
- Invoice **file** routes accept the token as a `?token=` query param (so `<img>`/PDF links work).
- Open routes: `GET /health`, `POST /auth/register`, `POST /auth/login`.

> All data is scoped to the authenticated `shop_id`.

---

## Endpoints

### Auth
| Method | Path | Body / notes |
|--------|------|--------------|
| POST | `/auth/register` | `{name, phone, pin, …}` → `{shop}` (409 if phone taken) |
| POST | `/auth/login` | `{phone, pin}` → `{shop}` with fresh token (401 on bad creds) |
| GET | `/auth/me` | current shop profile |
| PATCH | `/auth/me` | update profile fields |

### Voice
| Method | Path | Notes |
|--------|------|-------|
| POST | `/transcribe` | multipart `audio` → `{transcript}` (server Whisper; `""` if no key) |
| POST | `/parse-intent` | `{transcript}` → `{type:"khata"\|"invoice"\|"unknown", data}` (LLM or heuristic) |

### Customers / khata / ledger (id-based)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/ledger` | all customers + balances |
| GET | `/customer/{id}` | one customer: profile, txn history, balance |
| GET | `/customer/{id}/invoices` | that customer's invoices, newest first |
| POST | `/customers/resolve` | `{name}` → `{matches}` — **EXACT** matches only (disambiguation) |
| POST | `/customers/search` | `{name}` → `{matches}` — fuzzy contains (search only) |
| POST | `/customers` | `{name, phone?}` → always creates a **new** customer (even if name exists) |
| POST | `/customer/{id}/phone` | set/replace phone |
| POST | `/log-transaction` | `{customer_id? \| customer_name, amount, type, note?, phone?}` → `{balance, customer_id, customer_name}` |
| DELETE | `/transaction/{txn_id}` | remove an entry |
| GET | `/summary` | dashboard totals (receivable, advance, today, top debtors) |

### Invoices
| Method | Path | Notes |
|--------|------|-------|
| POST | `/generate-invoice` | build PDF+JPG, persist, return `{invoice_id, total, image_url, pdf_url}` |
| GET | `/invoices` | all invoices for the shop |
| GET | `/invoice/{id}` / `/invoice/{id}/image` | PDF / JPG file (`?token=` auth) |
| DELETE | `/invoice/{id}` | remove record + files |

### Reminders
| Method | Path | Notes |
|--------|------|-------|
| POST | `/send-reminder` | `{customer_name, amount, phone?}` → `{wa_link, auto_sent, message}` |

---

## Customer resolution — the core rule

Used by `/log-transaction` and the voice open-commands ([`_resolve_customer`](backend/main.py)):

```
explicit customer_id            -> use it
else match name EXACTLY (case-insensitive):
   exactly 1 match  -> use it
   0 matches        -> create a NEW khata (auto-create workflow)
   2+ matches       -> 409 {error:"ambiguous", candidates:[…]}  (caller MUST ask)
```

- **No partial/fuzzy auto-resolution.** "Udayveer Singh" never lands on "Udayveer".
- **Never silently picks** among duplicates — the UI shows a chooser (name · phone · balance).
- Fuzzy matching is available only via `/customers/search`, where the user picks explicitly.

---

## Primary voice flow

```
[mic] → Web Speech transcript → review/edit
     → matchCommand(text)                       (lib/commands.js)
        ├─ createKhata <name>  → POST /customers → open that khata
        ├─ openKhata  <name>   → resolve (exact) → open CustomerDetail (disambiguate if needed)
        ├─ openInvoice <name>  → resolve → GET /customer/{id}/invoices → open newest
        ├─ nav <tab>           → switch tab
        └─ (no command) → POST /parse-intent
              ├─ khata   → draft → resolve → POST /log-transaction
              └─ invoice → InvoiceCreate → POST /generate-invoice
```

Voice commands **complete the action** (open the actual khata/invoice, save the
entry) rather than only navigating to a page.

---

## Security notes (see [TODO.md](TODO.md))

- Real per-shop auth now exists (token), but: the token sits in invoice file URLs
  (`?token=`), no rate limiting on paid-API routes, and `_auth_for_file`'s
  `x_shop_token` param is read as a query value (only `?token=` is effective).
- `@app.on_event("startup")` is deprecated (should move to `lifespan`).
