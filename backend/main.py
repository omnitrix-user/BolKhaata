import json
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import auth
import database
import whatsapp
from intent_parser import parse_intent
from invoice_generator import generate_invoice_pdf
from invoice_image import generate_invoice_image
from models import (
    CustomerCreate,
    CustomerPhoneIn,
    Invoice,
    KhataEntry,
    ReminderIn,
    ShopLogin,
    ShopRegister,
    ShopUpdate,
    TranscriptIn,
)
from stt import transcribe_audio

app = FastAPI(title="BolKhaata")

# Allow the Vite dev server and any LAN origin (phones on the same wifi).
_origins = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else []
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):\d+",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Invoice-Id", "X-Invoice-Total", "X-Invoice-Url"],
)


@app.on_event("startup")
def _startup():
    database.init_db()


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "llm": bool(os.getenv("OPENROUTER_API_KEY")),
        "stt": bool(os.getenv("OPENAI_API_KEY")),
    }


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
@app.post("/auth/register")
def register(payload: ShopRegister):
    if database.get_shop_by_phone(payload.phone):
        raise HTTPException(status_code=409, detail="Phone already registered. Please login.")
    if not payload.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be digits only.")
    shop = database.create_shop(
        name=payload.name.strip(),
        owner_name=payload.owner_name.strip(),
        phone=payload.phone.strip(),
        gstin=payload.gstin.strip(),
        address=payload.address.strip(),
        pin_hash=auth.hash_pin(payload.pin),
        mode=payload.mode,
        business_type=payload.business_type,
        gst_rate=payload.gst_rate,
        upi_id=payload.upi_id,
    )
    return {"success": True, "shop": shop}


@app.post("/auth/login")
def login(payload: ShopLogin):
    row = database.get_shop_by_phone(payload.phone.strip())
    if row is None or not auth.verify_pin(payload.pin, row["pin_hash"]):
        raise HTTPException(status_code=401, detail="Galat phone ya PIN.")
    token = database.rotate_token(row["id"])
    shop = database.update_shop(row["id"])  # returns fresh public row (with new token)
    shop["token"] = token
    return {"success": True, "shop": shop}


@app.get("/auth/me")
def me(shop=Depends(auth.require_shop)):
    return {
        "id": shop["id"], "name": shop["name"], "owner_name": shop["owner_name"],
        "phone": shop["phone"], "gstin": shop["gstin"], "address": shop["address"],
        "mode": shop["mode"], "business_type": shop["business_type"],
        "gst_rate": shop["gst_rate"], "upi_id": shop["upi_id"], "token": shop["token"],
    }


@app.patch("/auth/me")
def update_me(payload: ShopUpdate, shop=Depends(auth.require_shop)):
    updated = database.update_shop(shop["id"], **payload.model_dump(exclude_none=True))
    return {"success": True, "shop": updated}


# --------------------------------------------------------------------------- #
# Voice
# --------------------------------------------------------------------------- #
@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), shop=Depends(auth.require_shop)):
    data = await audio.read()
    transcript = transcribe_audio(data, audio.filename or "audio.webm")
    return {"transcript": transcript}


@app.post("/parse-intent")
def parse_intent_endpoint(payload: TranscriptIn, shop=Depends(auth.require_shop)):
    return parse_intent(payload.transcript)


# --------------------------------------------------------------------------- #
# Customers / khata / ledger  (id-based; duplicate names supported)
# --------------------------------------------------------------------------- #
@app.get("/ledger")
def ledger(shop=Depends(auth.require_shop)):
    return {"customers": database.list_customers(shop["id"])}


@app.get("/customer/{customer_id}")
def customer_detail(customer_id: int, shop=Depends(auth.require_shop)):
    data = database.customer_history(shop["id"], customer_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return data


@app.post("/customers/resolve")
def resolve_customer(payload: CustomerCreate, shop=Depends(auth.require_shop)):
    """Return all customers matching a name (for voice/typed disambiguation)."""
    return {"matches": database.resolve_customers(shop["id"], payload.name)}


@app.post("/customers")
def create_customer(payload: CustomerCreate, shop=Depends(auth.require_shop)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name required.")
    return {"success": True, "customer": database.create_customer(
        shop["id"], payload.name.strip(), payload.phone.strip())}


@app.post("/customer/{customer_id}/phone")
def set_phone(customer_id: int, payload: CustomerPhoneIn, shop=Depends(auth.require_shop)):
    database.set_customer_phone(shop["id"], customer_id, payload.phone.strip())
    return {"success": True}


def _resolve_customer(shop_id, customer_id, customer_name, phone, allow_create=True):
    """Resolve to a single customer or raise 409 with candidates when ambiguous."""
    if customer_id:
        c = database.get_customer(shop_id, customer_id)
        if not c:
            raise HTTPException(status_code=404, detail="Customer not found")
        if phone:
            database.set_customer_phone(shop_id, customer_id, phone)
        return customer_id, c["name"]
    name = (customer_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Customer name required.")
    matches = database.resolve_customers(shop_id, name)
    if len(matches) == 1:
        cid = matches[0]["id"]
        if phone:
            database.set_customer_phone(shop_id, cid, phone)
        return cid, matches[0]["name"]
    if not matches:
        if not allow_create:
            raise HTTPException(status_code=404, detail="Customer not found")
        c = database.create_customer(shop_id, name, phone or "")
        return c["id"], c["name"]
    raise HTTPException(status_code=409, detail={"error": "ambiguous", "candidates": matches})


@app.post("/log-transaction")
def log_transaction(entry: KhataEntry, shop=Depends(auth.require_shop)):
    cid, name = _resolve_customer(shop["id"], entry.customer_id, entry.customer_name, entry.phone)
    date = entry.date or datetime.now().strftime("%d %b")
    balance = database.add_transaction(
        shop["id"], cid, name, entry.amount, entry.type, entry.note or "", date)
    return {"success": True, "balance": balance, "customer_id": cid, "customer_name": name}


@app.delete("/transaction/{txn_id}")
def delete_txn(txn_id: int, shop=Depends(auth.require_shop)):
    if not database.delete_transaction(shop["id"], txn_id):
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


@app.get("/summary")
def summary(shop=Depends(auth.require_shop)):
    return database.summary(shop["id"])


# --------------------------------------------------------------------------- #
# Invoices
# --------------------------------------------------------------------------- #
def _shop_info(shop):
    return {
        "name": shop["name"], "address": shop["address"], "phone": shop["phone"],
        "gstin": shop["gstin"], "business_type": shop["business_type"],
        "gst_rate": shop["gst_rate"], "upi_id": shop["upi_id"],
    }


def _link_invoice_customer(shop_id, customer_id, name):
    """Best-effort link an invoice to a customer (never blocks generation)."""
    if customer_id and database.get_customer(shop_id, customer_id):
        return customer_id
    matches = database.resolve_customers(shop_id, name) if name else []
    if len(matches) == 1:
        return matches[0]["id"]
    if not matches and (name or "").strip():
        return database.create_customer(shop_id, name.strip())["id"]
    return None  # ambiguous — store name only


@app.post("/generate-invoice")
def generate_invoice(invoice: Invoice, shop=Depends(auth.require_shop)):
    data = invoice.model_dump()
    info = _shop_info(shop)
    pdf_path, total = generate_invoice_pdf(data, info)
    invoice_id = data.get("invoice_id") or Path(pdf_path).stem
    data["invoice_id"] = invoice_id
    if not data.get("date"):
        data["date"] = datetime.now().strftime("%d %b %Y")
    generate_invoice_image(data, info)  # writes <id>.jpg alongside the PDF
    cid = _link_invoice_customer(shop["id"], data.get("customer_id"), data["customer_name"])
    database.save_invoice(
        shop["id"], cid, invoice_id, data["customer_name"],
        json.dumps(data.get("items", [])), total, data["date"], pdf_path,
    )
    return {
        "success": True,
        "invoice_id": invoice_id,
        "total": total,
        "image_url": f"/invoice/{invoice_id}/image",
        "pdf_url": f"/invoice/{invoice_id}",
    }


@app.get("/invoices")
def invoices(shop=Depends(auth.require_shop)):
    return {"invoices": database.list_invoices(shop["id"])}


@app.delete("/invoice/{invoice_id}")
def delete_invoice(invoice_id: str, shop=Depends(auth.require_shop)):
    if not database.delete_invoice(shop["id"], invoice_id):
        raise HTTPException(status_code=404, detail="Not found")
    for ext in ("pdf", "jpg"):
        f = Path(__file__).parent / "invoices" / f"{invoice_id}.{ext}"
        if f.exists():
            f.unlink()
    return {"success": True}


def _auth_for_file(invoice_id, token, x_shop_token):
    tok = token or x_shop_token
    shop = database.get_shop_by_token(tok) if tok else None
    if shop is None or not database.invoice_belongs_to_shop(shop["id"], invoice_id):
        return None
    return shop


@app.get("/invoice/{invoice_id}/image")
def get_invoice_image(invoice_id: str, token: str | None = None, x_shop_token: str | None = None):
    if _auth_for_file(invoice_id, token, x_shop_token) is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    path = Path(__file__).parent / "invoices" / f"{invoice_id}.jpg"
    if not path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(path, media_type="image/jpeg", filename=f"{invoice_id}.jpg")


@app.get("/invoice/{invoice_id}")
def get_invoice(invoice_id: str, token: str | None = None, x_shop_token: str | None = None):
    if _auth_for_file(invoice_id, token, x_shop_token) is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    path = Path(__file__).parent / "invoices" / f"{invoice_id}.pdf"
    if not path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(path, media_type="application/pdf", filename=f"{invoice_id}.pdf")


# --------------------------------------------------------------------------- #
# WhatsApp (wa.me deep links; Twilio optional)
# --------------------------------------------------------------------------- #
@app.post("/send-reminder")
def reminder(payload: ReminderIn, shop=Depends(auth.require_shop)):
    phone = payload.phone
    if not phone and payload.customer_name:
        matches = database.resolve_customers(shop["id"], payload.customer_name)
        if len(matches) == 1:
            phone = matches[0]["phone"]
    message = whatsapp.reminder_message(shop["name"], payload.customer_name, payload.amount)
    sent = whatsapp.try_twilio_send(phone, message)
    return {
        "success": True,
        "auto_sent": sent,
        "wa_link": whatsapp.wa_link(phone, message),
        "message": message,
        "phone": phone,
    }
