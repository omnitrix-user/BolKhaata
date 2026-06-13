import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "bolkhaata.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL,
            note TEXT DEFAULT '',
            date TEXT,
            phone TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id TEXT,
            customer_name TEXT NOT NULL,
            total REAL NOT NULL,
            date TEXT,
            pdf_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


def add_transaction(entry) -> float:
    """Insert a khata entry; return the signed running balance for the customer.

    Signed convention: credit (owes us) is negative, payment is positive.
    A negative balance means the customer still owes money.
    """
    signed = -abs(entry.amount) if entry.type == "credit" else abs(entry.amount)
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO transactions (customer_name, amount, type, note, date, phone) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (entry.customer_name, abs(entry.amount), entry.type, entry.note or "",
         entry.date, entry.phone),
    )
    conn.commit()
    balance = _customer_balance(cur, entry.customer_name)
    conn.close()
    return balance


def _signed(amount: float, ttype: str) -> float:
    return -abs(amount) if ttype == "credit" else abs(amount)


def _customer_balance(cur, name: str) -> float:
    cur.execute(
        "SELECT amount, type FROM transactions WHERE customer_name = ?", (name,)
    )
    return round(sum(_signed(r["amount"], r["type"]) for r in cur.fetchall()), 2)


def list_customers():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT customer_name FROM transactions ORDER BY customer_name")
    names = [r["customer_name"] for r in cur.fetchall()]
    out = [{"name": n, "balance": _customer_balance(cur, n)} for n in names]
    conn.close()
    return out


def customer_history(name: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT amount, type, note, date, created_at FROM transactions "
        "WHERE customer_name = ? ORDER BY id DESC",
        (name,),
    )
    txns = [
        {
            "amount": r["amount"],
            "type": r["type"],
            "note": r["note"],
            "date": r["date"] or r["created_at"],
        }
        for r in cur.fetchall()
    ]
    balance = _customer_balance(cur, name)
    conn.close()
    return txns, balance


def save_invoice(invoice_id, customer_name, total, date, pdf_path):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO invoices (invoice_id, customer_name, total, date, pdf_path) "
        "VALUES (?, ?, ?, ?, ?)",
        (invoice_id, customer_name, total, date, pdf_path),
    )
    conn.commit()
    conn.close()
