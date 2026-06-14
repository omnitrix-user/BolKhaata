"""SQLite data layer for BolKhaata.

Scoped to a shop (``shop_id``). Customers are first-class rows identified by an
integer ``id`` — duplicate names are allowed (disambiguated by phone), and
transactions reference ``customer_id``. ``customer_name`` is kept denormalised on
transactions/invoices for display and backward compatibility.
"""

import json
import secrets
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "bolkhaata.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _columns(cur, table):
    return {r[1] for r in cur.execute(f"PRAGMA table_info({table})")}


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS shops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            owner_name TEXT DEFAULT '',
            phone TEXT UNIQUE NOT NULL,
            gstin TEXT DEFAULT '',
            address TEXT DEFAULT '',
            pin_hash TEXT NOT NULL,
            mode TEXT DEFAULT 'single',
            business_type TEXT DEFAULT 'standard',
            gst_rate REAL DEFAULT 5,
            upi_id TEXT DEFAULT '',
            token TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    shop_cols = _columns(cur, "shops")
    for col, ddl in (
        ("business_type", "ALTER TABLE shops ADD COLUMN business_type TEXT DEFAULT 'standard'"),
        ("gst_rate", "ALTER TABLE shops ADD COLUMN gst_rate REAL DEFAULT 5"),
        ("upi_id", "ALTER TABLE shops ADD COLUMN upi_id TEXT DEFAULT ''"),
    ):
        if col not in shop_cols:
            cur.execute(ddl)

    # Customers — id-based, duplicate names allowed (NO unique on name).
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE
        )
        """
    )
    # Migrate an older customers table that still has UNIQUE(shop_id, name).
    master = cur.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='customers'"
    ).fetchone()
    if master and "UNIQUE" in (master["sql"] or "").upper():
        cur.execute("ALTER TABLE customers RENAME TO customers_old")
        cur.execute(
            """
            CREATE TABLE customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                phone TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE
            )
            """
        )
        cur.execute(
            "INSERT INTO customers (id, shop_id, name, phone, created_at) "
            "SELECT id, shop_id, name, phone, created_at FROM customers_old"
        )
        cur.execute("DROP TABLE customers_old")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            customer_id INTEGER,
            customer_name TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL,
            note TEXT DEFAULT '',
            date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE
        )
        """
    )
    if "customer_id" not in _columns(cur, "transactions"):
        cur.execute("ALTER TABLE transactions ADD COLUMN customer_id INTEGER")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            customer_id INTEGER,
            invoice_id TEXT,
            customer_name TEXT NOT NULL,
            items_json TEXT DEFAULT '[]',
            total REAL NOT NULL,
            date TEXT,
            pdf_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE
        )
        """
    )
    if "customer_id" not in _columns(cur, "invoices"):
        cur.execute("ALTER TABLE invoices ADD COLUMN customer_id INTEGER")

    # Indexes for scale.
    cur.execute("CREATE INDEX IF NOT EXISTS idx_txn_shop_cust ON transactions(shop_id, customer_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cust_shop_name ON customers(shop_id, name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_inv_shop ON invoices(shop_id)")

    conn.commit()
    _backfill_customer_ids(conn)
    conn.close()


def _backfill_customer_ids(conn) -> None:
    """Link legacy name-based transactions/invoices to customer rows."""
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT DISTINCT shop_id, customer_name FROM transactions WHERE customer_id IS NULL"
    ).fetchall()
    for r in rows:
        sid, name = r["shop_id"], r["customer_name"]
        existing = cur.execute(
            "SELECT id FROM customers WHERE shop_id = ? AND name = ? ORDER BY id LIMIT 1",
            (sid, name),
        ).fetchone()
        if existing:
            cid = existing["id"]
        else:
            cur.execute("INSERT INTO customers (shop_id, name) VALUES (?, ?)", (sid, name))
            cid = cur.lastrowid
        cur.execute(
            "UPDATE transactions SET customer_id = ? WHERE shop_id = ? AND customer_name = ? AND customer_id IS NULL",
            (cid, sid, name),
        )
        cur.execute(
            "UPDATE invoices SET customer_id = ? WHERE shop_id = ? AND customer_name = ? AND customer_id IS NULL",
            (cid, sid, name),
        )
    conn.commit()


# --------------------------------------------------------------------------- #
# Shops / auth
# --------------------------------------------------------------------------- #
def _new_token() -> str:
    return secrets.token_urlsafe(24)


def _shop_public(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "name": row["name"], "owner_name": row["owner_name"],
        "phone": row["phone"], "gstin": row["gstin"], "address": row["address"],
        "mode": row["mode"], "business_type": row["business_type"],
        "gst_rate": row["gst_rate"], "upi_id": row["upi_id"], "token": row["token"],
    }


def get_shop_by_phone(phone: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM shops WHERE phone = ?", (phone,)).fetchone()
    conn.close()
    return row


def get_shop_by_token(token: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM shops WHERE token = ?", (token,)).fetchone()
    conn.close()
    return row


def create_shop(name, owner_name, phone, gstin, address, pin_hash, mode,
                business_type="standard", gst_rate=5, upi_id="") -> dict:
    token = _new_token()
    if business_type == "street_vendor":
        gst_rate = 0
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO shops (name, owner_name, phone, gstin, address, pin_hash, mode, "
        "business_type, gst_rate, upi_id, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (name, owner_name or "", phone, gstin or "", address or "", pin_hash, mode,
         business_type, gst_rate, upi_id or "", token),
    )
    conn.commit()
    row = cur.execute("SELECT * FROM shops WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return _shop_public(row)


def rotate_token(shop_id: int) -> str:
    token = _new_token()
    conn = get_connection()
    conn.execute("UPDATE shops SET token = ? WHERE id = ?", (token, shop_id))
    conn.commit()
    conn.close()
    return token


def update_shop(shop_id: int, **fields) -> dict:
    allowed = {"name", "owner_name", "gstin", "address", "gst_rate", "upi_id", "business_type"}
    sets = {k: v for k, v in fields.items() if k in allowed and v is not None}
    conn = get_connection()
    cur = conn.cursor()
    if sets:
        cols = ", ".join(f"{k} = ?" for k in sets)
        cur.execute(f"UPDATE shops SET {cols} WHERE id = ?", (*sets.values(), shop_id))
        conn.commit()
    row = cur.execute("SELECT * FROM shops WHERE id = ?", (shop_id,)).fetchone()
    conn.close()
    return _shop_public(row)


# --------------------------------------------------------------------------- #
# Customers (id-based, duplicate names allowed)
# --------------------------------------------------------------------------- #
def _signed_sql():
    return "COALESCE(SUM(CASE WHEN t.type='credit' THEN -t.amount ELSE t.amount END), 0)"


def create_customer(shop_id: int, name: str, phone: str = "") -> dict:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO customers (shop_id, name, phone) VALUES (?, ?, ?)",
        (shop_id, name.strip(), (phone or "").strip()),
    )
    conn.commit()
    cid = cur.lastrowid
    conn.close()
    return {"id": cid, "name": name.strip(), "phone": (phone or "").strip(), "balance": 0.0}


def get_customer(shop_id: int, customer_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT id, name, phone FROM customers WHERE shop_id = ? AND id = ?",
        (shop_id, customer_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


_RESOLVE_SELECT = f"""
    SELECT c.id, c.name, c.phone, {_signed_sql()} AS balance,
           MAX(t.created_at) AS last_at
    FROM customers c LEFT JOIN transactions t ON t.customer_id = c.id
    WHERE c.shop_id = ? AND {{cond}}
    GROUP BY c.id ORDER BY last_at DESC
"""


def _rows_to_customers(rows):
    return [{"id": r["id"], "name": r["name"], "phone": r["phone"] or "",
             "balance": round(r["balance"], 2)} for r in rows]


def resolve_exact(shop_id: int, name: str):
    """Customers whose name is an EXACT (case-insensitive) match, with balances.

    This is the ONLY function used to auto-resolve a spoken/typed name to a ledger
    for transactions and for opening a khata/invoice. Partial matches are
    deliberately excluded: 'Udayveer' must never resolve to 'Udayveer Singh', and
    names are not unique — multiple exact matches return multiple candidates so the
    caller can force disambiguation. Never silently collapses different identities.
    """
    name = (name or "").strip()
    if not name:
        return []
    conn = get_connection()
    rows = conn.execute(
        _RESOLVE_SELECT.format(cond="LOWER(c.name) = LOWER(?)"), (shop_id, name)
    ).fetchall()
    conn.close()
    return _rows_to_customers(rows)


def search_customers(shop_id: int, query: str):
    """Fuzzy contains-match for the *search* feature only (never auto-resolves).

    Safe to be loose here because the user always picks a result explicitly.
    """
    query = (query or "").strip()
    if not query:
        return []
    conn = get_connection()
    like = f"%{query.lower()}%"
    rows = conn.execute(
        _RESOLVE_SELECT.format(cond="LOWER(c.name) LIKE ?"), (shop_id, like)
    ).fetchall()
    conn.close()
    return _rows_to_customers(rows)


def set_customer_phone(shop_id: int, customer_id: int, phone: str) -> None:
    conn = get_connection()
    conn.execute(
        "UPDATE customers SET phone = ? WHERE shop_id = ? AND id = ?",
        ((phone or "").strip(), shop_id, customer_id),
    )
    conn.commit()
    conn.close()


# --------------------------------------------------------------------------- #
# Transactions / ledger
# --------------------------------------------------------------------------- #
def _balance_by_id(cur, shop_id: int, customer_id: int) -> float:
    cur.execute(
        "SELECT amount, type FROM transactions WHERE shop_id = ? AND customer_id = ?",
        (shop_id, customer_id),
    )
    return round(sum(-abs(r["amount"]) if r["type"] == "credit" else abs(r["amount"])
                     for r in cur.fetchall()), 2)


def add_transaction(shop_id: int, customer_id: int, customer_name: str,
                    amount: float, ttype: str, note: str = "", date: str = None) -> float:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO transactions (shop_id, customer_id, customer_name, amount, type, note, date) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (shop_id, customer_id, customer_name.strip(), abs(amount), ttype, note or "", date),
    )
    conn.commit()
    balance = _balance_by_id(cur, shop_id, customer_id)
    conn.close()
    return balance


def list_customers(shop_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT c.id, c.name, c.phone, {_signed_sql()} AS balance,
               MAX(t.created_at) AS last_at, COUNT(t.id) AS txn_count
        FROM customers c LEFT JOIN transactions t ON t.customer_id = c.id
        WHERE c.shop_id = ?
        GROUP BY c.id
        ORDER BY (last_at IS NULL), last_at DESC, c.name
        """,
        (shop_id,),
    )
    out = [{"id": r["id"], "name": r["name"], "phone": r["phone"] or "",
            "balance": round(r["balance"], 2), "last_at": r["last_at"],
            "txn_count": r["txn_count"]} for r in cur.fetchall()]
    conn.close()
    return out


def customer_history(shop_id: int, customer_id: int):
    conn = get_connection()
    cur = conn.cursor()
    info = cur.execute(
        "SELECT id, name, phone FROM customers WHERE shop_id = ? AND id = ?",
        (shop_id, customer_id),
    ).fetchone()
    if not info:
        conn.close()
        return None
    cur.execute(
        "SELECT id, amount, type, note, date, created_at FROM transactions "
        "WHERE shop_id = ? AND customer_id = ? ORDER BY id DESC",
        (shop_id, customer_id),
    )
    txns = [{"id": r["id"], "amount": r["amount"], "type": r["type"], "note": r["note"],
             "date": r["date"] or r["created_at"], "created_at": r["created_at"]}
            for r in cur.fetchall()]
    balance = _balance_by_id(cur, shop_id, customer_id)
    conn.close()
    return {"id": info["id"], "name": info["name"], "phone": info["phone"] or "",
            "transactions": txns, "balance": balance}


def delete_transaction(shop_id: int, txn_id: int) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM transactions WHERE id = ? AND shop_id = ?", (txn_id, shop_id))
    conn.commit()
    changed = cur.rowcount > 0
    conn.close()
    return changed


def summary(shop_id: int) -> dict:
    customers = list_customers(shop_id)
    receivable = round(sum(-c["balance"] for c in customers if c["balance"] < 0), 2)
    advance = round(sum(c["balance"] for c in customers if c["balance"] > 0), 2)
    due = [c for c in customers if c["balance"] < 0]

    today = datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT amount, type FROM transactions WHERE shop_id = ? AND date(created_at) = ?",
        (shop_id, today),
    )
    tc = tp = 0.0
    for r in cur.fetchall():
        if r["type"] == "credit":
            tc += abs(r["amount"])
        else:
            tp += abs(r["amount"])
    conn.close()
    return {
        "total_receivable": receivable, "total_advance": advance,
        "customer_count": len(customers), "due_count": len(due),
        "today_credit": round(tc, 2), "today_payment": round(tp, 2),
        "top_debtors": sorted(due, key=lambda c: c["balance"])[:5],
    }


# --------------------------------------------------------------------------- #
# Invoices
# --------------------------------------------------------------------------- #
def save_invoice(shop_id, customer_id, invoice_id, customer_name, items_json, total, date, pdf_path):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO invoices (shop_id, customer_id, invoice_id, customer_name, items_json, total, date, pdf_path) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (shop_id, customer_id, invoice_id, customer_name, items_json, total, date, pdf_path),
    )
    conn.commit()
    conn.close()


def list_invoices(shop_id: int, customer_id: int = None):
    """Invoices for a shop, newest first. Optionally scoped to one customer_id
    (used by the voice command 'open the last invoice of X')."""
    conn = get_connection()
    cur = conn.cursor()
    # Join the linked customer so the UI has a phone number for WhatsApp sharing.
    cols = ("SELECT i.invoice_id, i.customer_id, i.customer_name, i.items_json, i.total, "
            "i.date, i.created_at, COALESCE(c.phone, '') AS phone "
            "FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id ")
    if customer_id is None:
        cur.execute(cols + "WHERE i.shop_id = ? ORDER BY i.id DESC", (shop_id,))
    else:
        cur.execute(cols + "WHERE i.shop_id = ? AND i.customer_id = ? ORDER BY i.id DESC",
                    (shop_id, customer_id))
    out = [{"invoice_id": r["invoice_id"], "customer_id": r["customer_id"],
            "customer_name": r["customer_name"], "phone": r["phone"] or "",
            "items": json.loads(r["items_json"] or "[]"), "total": r["total"],
            "date": r["date"] or r["created_at"]} for r in cur.fetchall()]
    conn.close()
    return out


def invoice_belongs_to_shop(shop_id: int, invoice_id: str) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT 1 FROM invoices WHERE shop_id = ? AND invoice_id = ?", (shop_id, invoice_id)
    ).fetchone()
    conn.close()
    return row is not None


def delete_invoice(shop_id: int, invoice_id: str) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM invoices WHERE shop_id = ? AND invoice_id = ?", (shop_id, invoice_id))
    conn.commit()
    changed = cur.rowcount > 0
    conn.close()
    return changed
