# BolKhaata — Database

**Engine:** SQLite (file-based)
**File:** `backend/bolkhaata.db`
**Access layer:** [`backend/database.py`](backend/database.py) (raw `sqlite3`, no ORM)
**Schema creation:** `init_db()` runs on FastAPI startup and is idempotent (`CREATE TABLE IF NOT EXISTS`).

---

## Schema

### Table: `transactions`
Every ledger entry (one row per credit or payment).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `customer_name` | TEXT NOT NULL | Customers are **identified by name only** — there is no customers table |
| `amount` | REAL NOT NULL | Stored as an **absolute (unsigned)** value |
| `type` | TEXT NOT NULL | `'credit'` (udhaar, owes us) or `'payment'` (received) |
| `note` | TEXT DEFAULT '' | Free text |
| `date` | TEXT | Human string like `"13 Jun"`; defaults to current date if absent |
| `phone` | TEXT | Optional customer phone |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | Server insert time |

### Table: `invoices`
One row per generated invoice PDF.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `invoice_id` | TEXT | e.g. `INV250613...`; not unique-constrained |
| `customer_name` | TEXT NOT NULL | |
| `total` | REAL NOT NULL | Grand total incl. GST |
| `date` | TEXT | Human string |
| `pdf_path` | TEXT | Absolute path to the generated PDF on disk |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |

> Invoice line items are **not** stored — only the total. The PDF on disk is the only record of line detail. `sqlite_sequence` is SQLite's internal autoincrement bookkeeping table.

---

## Balance convention (important)

Amounts are stored **unsigned**; the sign is applied at read time in `_signed()`:

```
credit  → -amount   (customer owes us)
payment → +amount   (customer paid us)
balance  = sum of signed amounts, rounded to 2 dp
```

So a **negative balance means the customer still owes money**, and a positive/zero balance means settled or overpaid.

> ⚠️ The frontend ledger view highlights a balance as "due" when `balance > 0`, which is the **opposite** of this convention. See the bug note in [TODO.md](TODO.md).

Balances are **computed on the fly** (`_customer_balance`) by summing all of a customer's rows — they are not cached or stored. This is simple and always-correct but scans all of a customer's transactions per read.

---

## Data access functions ([`database.py`](backend/database.py))

| Function | Purpose |
|----------|---------|
| `init_db()` | Create tables if missing |
| `add_transaction(entry)` | Insert a row, return the customer's new signed balance |
| `list_customers()` | Distinct customer names, each with computed balance |
| `customer_history(name)` | All of a customer's transactions (newest first) + balance |
| `save_invoice(...)` | Persist an invoice record |
| `_signed`, `_customer_balance` | Internal balance helpers |

---

## Notes, limitations & risks

- **No customers table / no foreign keys.** A customer is just a string that recurs across rows. Renames, merges, and typos create distinct "customers" (e.g. *"Ramesh"* vs *"ramesh"* are different).
- **No indexes** beyond the implicit primary key. `WHERE customer_name = ?` does a full scan; fine at small scale, slow as data grows. An index on `customer_name` is recommended.
- **No multi-tenancy.** There is no `user`/`shop` table — the DB holds one shopkeeper's data and has no auth (see [API_FLOW.md](API_FLOW.md)).
- **No migrations.** Schema changes must be applied manually; `init_db` only ever adds missing tables, never alters existing ones.
- **`bolkhaata.db` is committed to git** and currently contains test data (2 transactions). Consider gitignoring it so real data and test data don't mix.
- **`date` is an unparseable display string**, not an ISO date — it can't be sorted or range-queried reliably. Ordering uses `id` / `created_at` instead.
