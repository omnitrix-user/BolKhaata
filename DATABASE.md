# BolKhaata — Database

**Engine:** SQLite (file-based) · **File:** `backend/bolkhaata.db` (gitignored)
**Access layer:** [`backend/database.py`](backend/database.py) (raw `sqlite3`, no ORM)
**Schema creation/migration:** `init_db()` runs on startup — idempotent `CREATE TABLE IF NOT EXISTS`, additive `ALTER TABLE` migrations, an index pass, and a one-time backfill linking legacy name-based rows to customer ids. `PRAGMA foreign_keys = ON`.

> Updated for the id-based, multi-shop, duplicate-name model.

---

## Schema

### `shops` — one row per shop account (the tenant)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name`, `owner_name`, `address`, `gstin`, `upi_id` | TEXT | profile |
| `phone` | TEXT **UNIQUE** NOT NULL | login identity |
| `pin_hash` | TEXT NOT NULL | PBKDF2 `salt$iterations$hash` |
| `token` | TEXT **UNIQUE** NOT NULL | session token (`X-Shop-Token`); rotates on login |
| `mode` | TEXT | `single` / `multi` |
| `business_type` | TEXT | `standard` / `street_vendor` (forces gst_rate 0) |
| `gst_rate` | REAL | default invoice GST % |
| `created_at` | TIMESTAMP | |

### `customers` — first-class identities (duplicate names allowed)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | **the real identity** |
| `shop_id` | INTEGER NOT NULL | FK → shops, `ON DELETE CASCADE` |
| `name` | TEXT NOT NULL | **NOT unique** — many customers can share a name |
| `phone` | TEXT | disambiguator / for reminders |
| `created_at` | TIMESTAMP | |

> There is intentionally **no `UNIQUE(shop_id, name)`**. Names are not identifiers; the integer `id` is. `init_db()` migrates older DBs that still had the unique constraint by rebuilding the table.

### `transactions` — one row per credit/payment
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `shop_id` | INTEGER NOT NULL | FK → shops, cascade |
| `customer_id` | INTEGER | **the link used for balances** |
| `customer_name` | TEXT NOT NULL | denormalised for display |
| `amount` | REAL NOT NULL | stored **unsigned** |
| `type` | TEXT NOT NULL | `credit` (owes us) / `payment` (paid us) |
| `note`, `date` | TEXT | `date` is a human string (e.g. `"13 Jun"`) |
| `created_at` | TIMESTAMP | |

### `invoices` — one row per generated invoice
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `shop_id` | INTEGER NOT NULL | FK → shops, cascade |
| `customer_id` | INTEGER | best-effort link (powers "last invoice of X") |
| `invoice_id` | TEXT | display id, e.g. `INV260613...` |
| `customer_name` | TEXT NOT NULL | |
| `items_json` | TEXT | full line items as JSON (now persisted) |
| `total` | REAL NOT NULL | grand total incl. GST |
| `date`, `pdf_path` | TEXT | |
| `created_at` | TIMESTAMP | |

**Indexes:** `transactions(shop_id, customer_id)`, `customers(shop_id, name)`, `invoices(shop_id)`.

---

## Balance convention

Amounts are stored **unsigned**; sign applied at read time:

```
credit  → -amount   (customer owes the shop)
payment → +amount   (customer paid the shop)
balance  = SUM(signed) per customer_id, rounded to 2dp
```

A **negative balance means the customer still owes**. Balances are computed by
`customer_id` (`_balance_by_id` / the `_signed_sql()` SUM in list/resolve queries),
so two customers who share a name keep **independent** balances.

---

## Key data-access functions

| Function | Purpose |
|----------|---------|
| `create_customer` | always inserts a NEW customer (never dedupes) |
| `resolve_exact(shop, name)` | **exact** case-insensitive matches only — used for all auto-resolution |
| `search_customers(shop, q)` | fuzzy `LIKE` — search UI only, never auto-resolves |
| `add_transaction(shop, customer_id, …)` | insert + return new signed balance |
| `customer_history(shop, customer_id)` | txns + balance for one id |
| `list_customers` / `summary` | ledger list + dashboard totals |
| `list_invoices(shop, customer_id=None)` | all or per-customer invoices (newest first) |

---

## Limitations / known issues (see [TODO.md](TODO.md))

- `summary()`'s "today" totals compare local `datetime.now()` against UTC
  `created_at` — can be off near midnight / outside UTC.
- `date` is a display string, not ISO — not range-queryable; ordering uses `id`/`created_at`.
- Token rotates on every login → effectively one active session per shop.
- No schema-version migrations framework (only additive `ALTER`/rebuild in `init_db`).
