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
# Khata / ledger
# --------------------------------------------------------------------------- #
@app.post("/log-transaction")
def log_transaction(entry: KhataEntry, shop=Depends(auth.require_shop)):
    if not entry.customer_name.strip():
        raise HTTPException(status_code=400, detail="Customer name required.")
    if not entry.date:
        entry.date = datetime.now().strftime("%d %b")
    balance = database.add_transaction(shop["id"], entry)
    return {"success": True, "balance": balance}


@app.get("/ledger")
def ledger(shop=Depends(auth.require_shop)):
    return {"customers": database.list_customers(shop["id"])}


@app.get("/ledger/{name}")
def ledger_for(name: str, shop=Depends(auth.require_shop)):
    txns, balance, phone = database.customer_history(shop["id"], name)
    return {"transactions": txns, "balance": balance, "phone": phone}


@app.delete("/transaction/{txn_id}")
def delete_txn(txn_id: int, shop=Depends(auth.require_shop)):
    ok = database.delete_transaction(shop["id"], txn_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


@app.post("/customer/{name}/phone")
def set_phone(name: str, payload: CustomerPhoneIn, shop=Depends(auth.require_shop)):
    database.set_customer_phone(shop["id"], name, payload.phone.strip())
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
    database.save_invoice(
        shop["id"], invoice_id, data["customer_name"],
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
    phone = payload.phone or database.get_customer_phone(shop["id"], payload.customer_name)
    message = whatsapp.reminder_message(shop["name"], payload.customer_name, payload.amount)
    sent = whatsapp.try_twilio_send(phone, message)
    return {
        "success": True,
        "auto_sent": sent,
        "wa_link": whatsapp.wa_link(phone, message),
        "message": message,
        "phone": phone,
    }
