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
import intent_parser
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


def test_invoice_phone_link():
    print("\n[7] Invoice -> customer link uses phone to break duplicate-name ties")
    shop = _shop()
    r1 = db.create_customer(shop, "Rahul", "9991112222")["id"]
    r2 = db.create_customer(shop, "Rahul", "9993334444")["id"]

    # No phone + duplicate name -> ambiguous -> store name only (None).
    check("ambiguous 'Rahul' without phone -> no link", main._link_invoice_customer(shop, None, "Rahul", None) is None)
    # Phone picks the exact duplicate.
    check("phone disambiguates to the right Rahul", main._link_invoice_customer(shop, None, "Rahul", "9993334444") == r2)
    check("other Rahul not chosen", main._link_invoice_customer(shop, None, "Rahul", "9991112222") == r1)

    # Unique name -> links and backfills a missing phone.
    s = db.create_customer(shop, "Suresh")["id"]
    linked = main._link_invoice_customer(shop, None, "Suresh", "9990001111")
    check("unique name links to its id", linked == s)
    check("missing phone is backfilled", db.get_customer(shop, s)["phone"] == "9990001111")

    # Unknown name -> creates a new customer carrying the phone.
    new_id = main._link_invoice_customer(shop, None, "Naya Grahak", "9998887777")
    created = db.get_customer(shop, new_id)
    check("unknown name creates new customer", created is not None and created["name"] == "Naya Grahak")
    check("new customer keeps the spoken phone", created["phone"] == "9998887777")


def test_heuristic_full_name_and_invoice():
    print("\n[8] Offline heuristic: full names + invoice line-items")
    # Full name (given + surname) is kept, not truncated to the first token.
    khata = intent_parser._heuristic("Suresh Kumar ko 200 udhaar")
    check("full name captured ('Suresh Kumar')", khata["data"]["customer_name"] == "Suresh Kumar")
    check("amount parsed (200)", khata["data"]["amount"] == 200)

    # Bill keyword -> invoice with parsed items (offline, no LLM key).
    inv = intent_parser._heuristic("Rahul ka bill, 3 kilo chawal 40, 2 packet cheeni 50")
    check("bill phrase -> type invoice", inv["type"] == "invoice")
    items = inv["data"]["items"]
    check("two line-items parsed", len(items) == 2)
    check("first item qty/rate (3 @ 40)", items[0]["qty"] == 3 and items[0]["rate"] == 40)
    check("customer not captured as an item", all(it["name"].lower() != "rahul" for it in items))

    # Natural English purchase, no 'bill' keyword: 'in 200' is the LINE TOTAL so
    # rate = 200/2 = 100 (qty*rate must equal the spoken total).
    eng = intent_parser._heuristic("Rahul bought 2kg of flour in 200 rupees")
    check("purchase verb -> type invoice", eng["type"] == "invoice")
    check("customer is 'Rahul'", eng["data"]["customer_name"] == "Rahul")
    fit = eng["data"]["items"][0]
    check("item name is 'Flour'", fit["name"] == "Flour")
    check("qty 2, rate 100 (total 200)", fit["qty"] == 2 and fit["rate"] == 100 and fit["qty"] * fit["rate"] == 200)

    # Trailing customer ('... for Imran') is the customer, not an item.
    trail = intent_parser._heuristic("2 packets of biscuits at 30 each for Imran")
    check("trailing 'for X' is the customer", trail["data"]["customer_name"] == "Imran")
    check("per-unit rate kept (30)", trail["data"]["items"][0]["rate"] == 30)
    check("trailing name not an item", all(it["name"].lower() != "imran" for it in trail["data"]["items"]))


def test_parse_intent_offline():
    print("\n[9] parse_intent falls back to the heuristic with no LLM available")
    os.environ["USE_OLLAMA"] = "0"            # don't touch the network
    os.environ.pop("OPENROUTER_API_KEY", None)
    r = intent_parser.parse_intent("Rahul bought 2kg of flour in 200 rupees")
    check("offline parse -> invoice", r["type"] == "invoice")
    it = r["data"]["items"][0]
    check("offline item math (2 x 100 = 200)", it["qty"] * it["rate"] == 200)
    k = intent_parser.parse_intent("Suresh Kumar ko 200 udhaar")
    check("offline khata keeps full name", k["type"] == "khata" and k["data"]["customer_name"] == "Suresh Kumar")
    os.environ.pop("USE_OLLAMA", None)


def main_run():
    for fn in (
        test_udayveer_vs_udayveer_singh,
        test_multiple_rahul_disambiguation,
        test_new_duplicate_khata_creation,
        test_balances_isolated_by_id,
        test_add_transaction_by_id,
        test_open_last_invoice,
        test_invoice_phone_link,
        test_heuristic_full_name_and_invoice,
        test_parse_intent_offline,
    ):
        _fresh_db()
        fn()

    passed = sum(1 for _, ok in RESULTS if ok)
    total = len(RESULTS)
    print(f"\n{'=' * 40}\n{passed}/{total} checks passed\n{'=' * 40}")
    raise SystemExit(0 if passed == total else 1)


if __name__ == "__main__":
    main_run()
