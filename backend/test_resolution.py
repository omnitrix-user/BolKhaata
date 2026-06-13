"""Runnable tests for the customer-resolution & khata rules.

No pytest required — uses a throwaway SQLite file so the real bolkhaata.db is
never touched:

    cd backend && python3 test_resolution.py

Covers the high-priority requirements:
  * Udayveer vs Udayveer Singh  (exact-match only; partial never auto-resolves)
  * Multiple Rahul entries       (mandatory disambiguation, never silent pick)
  * New duplicate khata creation (same name -> separate ids, balances isolated)
  * Add-transaction by id
  * Open-last-invoice retrieval
"""

import os
import tempfile

from fastapi import HTTPException

import database as db
import main


def _fresh_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(path)  # let sqlite create it fresh
    db.DB_PATH = path
    db.init_db()
    return path


def _shop():
    return db.create_shop(
        name="Test Shop", owner_name="Owner", phone="9999999999",
        gstin="", address="", pin_hash="x", mode="single",
    )["id"]


# --------------------------------------------------------------------------- #
RESULTS = []


def check(name, cond):
    RESULTS.append((name, bool(cond)))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")


# --------------------------------------------------------------------------- #
def test_udayveer_vs_udayveer_singh():
    print("\n[1] Udayveer  vs  Udayveer Singh")
    shop = _shop()
    db.create_customer(shop, "Udayveer")

    # Partial name must NOT resolve to the existing different identity.
    check("exact('Udayveer Singh') returns no match", db.resolve_exact(shop, "Udayveer Singh") == [])
    check("exact('Udayveer') returns the 1 real match", len(db.resolve_exact(shop, "Udayveer")) == 1)

    # Logging "Udayveer Singh" creates a NEW khata, leaving Udayveer untouched.
    cid, name = main._resolve_customer(shop, None, "Udayveer Singh", None)
    check("logging 'Udayveer Singh' creates a new khata", name == "Udayveer Singh")
    udayveers = db.resolve_exact(shop, "Udayveer")
    check("original 'Udayveer' was NOT modified/merged", len(udayveers) == 1 and udayveers[0]["balance"] == 0)
    check("the two are distinct customer ids", cid != udayveers[0]["id"])


def test_multiple_rahul_disambiguation():
    print("\n[2] Three customers named Rahul -> must disambiguate")
    shop = _shop()
    db.create_customer(shop, "Rahul", "98765XXXXX")
    db.create_customer(shop, "Rahul", "99887XXXXX")
    db.create_customer(shop, "Rahul", "91234XXXXX")

    matches = db.resolve_exact(shop, "Rahul")
    check("exact('Rahul') returns all 3", len(matches) == 3)
    check("all 3 have unique ids", len({m["id"] for m in matches}) == 3)

    # The backend must refuse to silently pick — raises 409 'ambiguous'.
    raised = None
    try:
        main._resolve_customer(shop, None, "Rahul", None)
    except HTTPException as e:
        raised = e
    check("logging 'Rahul' raises 409 ambiguous", raised is not None and raised.status_code == 409)
    check("409 carries the candidate list", raised and raised.detail.get("candidates") and len(raised.detail["candidates"]) == 3)


def test_new_duplicate_khata_creation():
    print("\n[3] 'Open a new khata for Rahul' when Rahul already exists")
    shop = _shop()
    a = db.create_customer(shop, "Rahul")
    b = db.create_customer(shop, "Rahul")  # never blocked, never merged
    c = db.create_customer(shop, "Rahul")
    ids = {a["id"], b["id"], c["id"]}
    check("3 separate khatas created for same name", len(ids) == 3)
    check("exact('Rahul') now lists 3", len(db.resolve_exact(shop, "Rahul")) == 3)


def test_balances_isolated_by_id():
    print("\n[4] Same-name customers keep independent balances")
    shop = _shop()
    r1 = db.create_customer(shop, "Rahul")["id"]
    r2 = db.create_customer(shop, "Rahul")["id"]
    db.add_transaction(shop, r1, "Rahul", 500, "credit")  # only r1 owes
    h1 = db.customer_history(shop, r1)
    h2 = db.customer_history(shop, r2)
    check("Rahul #1 balance is -500", h1["balance"] == -500)
    check("Rahul #2 balance is untouched (0)", h2["balance"] == 0)


def test_add_transaction_by_id():
    print("\n[5] Add transaction directly by customer_id")
    shop = _shop()
    cid = db.create_customer(shop, "Suresh")["id"]
    rid, name = main._resolve_customer(shop, cid, None, None)
    bal = db.add_transaction(shop, rid, name, 200, "credit")
    check("explicit id resolves to itself", rid == cid)
    check("balance after one credit is -200", bal == -200)


def test_open_last_invoice():
    print("\n[6] Open the last invoice of a customer")
    shop = _shop()
    cid = db.create_customer(shop, "Imran")["id"]
    db.save_invoice(shop, cid, "INV001", "Imran", "[]", 100.0, "01 Jun", "/x/INV001.pdf")
    db.save_invoice(shop, cid, "INV002", "Imran", "[]", 250.0, "02 Jun", "/x/INV002.pdf")
    other = db.create_customer(shop, "Other")["id"]
    db.save_invoice(shop, other, "INV003", "Other", "[]", 1.0, "03 Jun", "/x/INV003.pdf")

    invs = db.list_invoices(shop, cid)
    check("only Imran's invoices returned", len(invs) == 2)
    check("newest invoice is first (INV002)", invs[0]["invoice_id"] == "INV002")


def main_run():
    for fn in (
        test_udayveer_vs_udayveer_singh,
        test_multiple_rahul_disambiguation,
        test_new_duplicate_khata_creation,
        test_balances_isolated_by_id,
        test_add_transaction_by_id,
        test_open_last_invoice,
    ):
        _fresh_db()
        fn()

    passed = sum(1 for _, ok in RESULTS if ok)
    total = len(RESULTS)
    print(f"\n{'=' * 40}\n{passed}/{total} checks passed\n{'=' * 40}")
    raise SystemExit(0 if passed == total else 1)


if __name__ == "__main__":
    main_run()
