"""SQLite data layer for BolKhaata.

Everything is scoped to a shop. A shop is identified internally by an integer
``shop_id``; the frontend authenticates with an opaque ``token`` that maps to a
shop. Customers are first-class (so we can remember a phone number for WhatsApp
reminders), and transactions/invoices both carry ``shop_id``.
"""

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

    # Migrate older DBs that predate business_type/gst_rate/upi_id.
    cols = {r[1] for r in cur.execute("PRAGMA table_info(shops)")}
    for col, ddl in (
        ("business_type", "ALTER TABLE shops ADD COLUMN business_type TEXT DEFAULT 'standard'"),
        ("gst_rate", "ALTER TABLE shops ADD COLUMN gst_rate REAL DEFAULT 5"),
        ("upi_id", "ALTER TABLE shops ADD COLUMN upi_id TEXT DEFAULT ''"),
    ):
        if col not in cols:
            cur.execute(ddl)

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(shop_id, name),
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
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

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
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

    conn.commit()
    conn.close()


# --------------------------------------------------------------------------- #
# Shops / auth
# --------------------------------------------------------------------------- #
def _new_token() -> str:
    return secrets.token_urlsafe(24)


def _shop_public(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "owner_name": row["owner_name"],
        "phone": row["phone"],
        "gstin": row["gstin"],
        "address": row["address"],
        "mode": row["mode"],
        "business_type": row["business_type"],
        "gst_rate": row["gst_rate"],
        "upi_id": row["upi_id"],
        "token": row["token"],
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
        "business_type, gst_rate, upi_id, token) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
# Customers
# --------------------------------------------------------------------------- #
def upsert_customer(shop_id: int, name: str, phone: str | None = None) -> None:
    name = name.strip()
    if not name:
        return
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO customers (shop_id, name, phone) VALUES (?, ?, ?) "
        "ON CONFLICT(shop_id, name) DO UPDATE SET phone = "
        "CASE WHEN excluded.phone != '' THEN excluded.phone ELSE customers.phone END",
        (shop_id, name, (phone or "").strip()),
    )
    conn.commit()
    conn.close()


def get_customer_phone(shop_id: int, name: str) -> str:
    conn = get_connection()
    row = conn.execute(
        "SELECT phone FROM customers WHERE shop_id = ? AND name = ?", (shop_id, name)
    ).fetchone()
    conn.close()
    return (row["phone"] if row else "") or ""


def set_customer_phone(shop_id: int, name: str, phone: str) -> None:
    upsert_customer(shop_id, name, phone)


# --------------------------------------------------------------------------- #
# Transactions / ledger
# --------------------------------------------------------------------------- #
def _signed(amount: float, ttype: str) -> float:
    # credit = customer owes us (negative). payment = customer paid (positive).
    return -abs(amount) if ttype == "credit" else abs(amount)


def _customer_balance(cur, shop_id: int, name: str) -> float:
    cur.execute(
        "SELECT amount, type FROM transactions WHERE shop_id = ? AND customer_name = ?",
        (shop_id, name),
    )
    return round(sum(_signed(r["amount"], r["type"]) for r in cur.fetchall()), 2)


def add_transaction(shop_id: int, entry) -> float:
    upsert_customer(shop_id, entry.customer_name, entry.phone)
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO transactions (shop_id, customer_name, amount, type, note, date) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (shop_id, entry.customer_name.strip(), abs(entry.amount), entry.type,
         entry.note or "", entry.date),
    )
    conn.commit()
    balance = _customer_balance(cur, shop_id, entry.customer_name.strip())
    conn.close()
    return balance


def list_customers(shop_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT t.customer_name AS name,
               MAX(t.created_at) AS last_at,
               COALESCE(c.phone, '') AS phone
        FROM transactions t
        LEFT JOIN customers c ON c.shop_id = t.shop_id AND c.name = t.customer_name
        WHERE t.shop_id = ?
        GROUP BY t.customer_name
        ORDER BY last_at DESC
        """,
        (shop_id,),
    )
    rows = cur.fetchall()
    out = [
        {
            "name": r["name"],
            "phone": r["phone"],
            "balance": _customer_balance(cur, shop_id, r["name"]),
            "last_at": r["last_at"],
        }
        for r in rows
    ]
    conn.close()
    return out


def customer_history(shop_id: int, name: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, amount, type, note, date, created_at FROM transactions "
        "WHERE shop_id = ? AND customer_name = ? ORDER BY id DESC",
        (shop_id, name),
    )
    txns = [
        {
            "id": r["id"],
            "amount": r["amount"],
            "type": r["type"],
            "note": r["note"],
            "date": r["date"] or r["created_at"],
            "created_at": r["created_at"],
        }
        for r in cur.fetchall()
    ]
    balance = _customer_balance(cur, shop_id, name)
    phone = get_customer_phone(shop_id, name)
    conn.close()
    return txns, balance, phone


def delete_transaction(shop_id: int, txn_id: int) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM transactions WHERE id = ? AND shop_id = ?", (txn_id, shop_id)
    )
    conn.commit()
    changed = cur.rowcount > 0
    conn.close()
    return changed


def summary(shop_id: int) -> dict:
    """Dashboard totals: total receivable, advances, customer count, today's tally."""
    customers = list_customers(shop_id)
    receivable = round(sum(-c["balance"] for c in customers if c["balance"] < 0), 2)
    advance = round(sum(c["balance"] for c in customers if c["balance"] > 0), 2)
    due_customers = [c for c in customers if c["balance"] < 0]

    today = datetime.now().strftime("%Y-%m-%d")
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT amount, type FROM transactions "
        "WHERE shop_id = ? AND date(created_at) = ?",
        (shop_id, today),
    )
    today_credit = today_payment = 0.0
    for r in cur.fetchall():
        if r["type"] == "credit":
            today_credit += abs(r["amount"])
        else:
            today_payment += abs(r["amount"])
    conn.close()

    return {
        "total_receivable": receivable,
        "total_advance": advance,
        "customer_count": len(customers),
        "due_count": len(due_customers),
        "today_credit": round(today_credit, 2),
        "today_payment": round(today_payment, 2),
        "top_debtors": sorted(due_customers, key=lambda c: c["balance"])[:5],
    }


# --------------------------------------------------------------------------- #
# Invoices
# --------------------------------------------------------------------------- #
def save_invoice(shop_id, invoice_id, customer_name, items_json, total, date, pdf_path):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO invoices (shop_id, invoice_id, customer_name, items_json, total, date, pdf_path) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (shop_id, invoice_id, customer_name, items_json, total, date, pdf_path),
    )
    conn.commit()
    conn.close()


def list_invoices(shop_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT invoice_id, customer_name, items_json, total, date, created_at "
        "FROM invoices WHERE shop_id = ? ORDER BY id DESC",
        (shop_id,),
    )
    import json

    out = [
        {
            "invoice_id": r["invoice_id"],
            "customer_name": r["customer_name"],
            "items": json.loads(r["items_json"] or "[]"),
            "total": r["total"],
            "date": r["date"] or r["created_at"],
        }
        for r in cur.fetchall()
    ]
    conn.close()
    return out


def invoice_belongs_to_shop(shop_id: int, invoice_id: str) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT 1 FROM invoices WHERE shop_id = ? AND invoice_id = ?",
        (shop_id, invoice_id),
    ).fetchone()
    conn.close()
    return row is not None
