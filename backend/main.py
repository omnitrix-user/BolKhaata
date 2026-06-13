from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import database
from intent_parser import parse_intent
from invoice_generator import generate_invoice_pdf
from models import Invoice, KhataEntry, ReminderIn, TranscriptIn
from stt import transcribe_audio
from whatsapp import send_reminder

app = FastAPI(title="BolKhaata")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    database.init_db()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    data = await audio.read()
    transcript = transcribe_audio(data, audio.filename or "audio.webm")
    return {"transcript": transcript}


@app.post("/parse-intent")
def parse_intent_endpoint(payload: TranscriptIn):
    return parse_intent(payload.transcript)


@app.post("/log-transaction")
def log_transaction(entry: KhataEntry):
    if not entry.date:
        entry.date = datetime.now().strftime("%d %b")
    balance = database.add_transaction(entry)
    return {"success": True, "balance": balance}


@app.get("/ledger")
def ledger():
    return {"customers": database.list_customers()}


@app.get("/ledger/{name}")
def ledger_for(name: str):
    txns, balance = database.customer_history(name)
    return {"transactions": txns, "balance": balance}


@app.post("/generate-invoice")
def generate_invoice(invoice: Invoice):
    data = invoice.model_dump()
    path, total = generate_invoice_pdf(data)
    invoice_id = data.get("invoice_id") or Path(path).stem
    database.save_invoice(
        invoice_id, data["customer_name"], total,
        data.get("date") or datetime.now().strftime("%d %b"), path,
    )
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{invoice_id}.pdf",
        headers={
            "X-Invoice-Id": invoice_id,
            "X-Invoice-Total": str(total),
            "X-Invoice-Url": f"/invoice/{invoice_id}",
            "Access-Control-Expose-Headers": "X-Invoice-Id,X-Invoice-Total,X-Invoice-Url",
        },
    )


@app.get("/invoice/{invoice_id}")
def get_invoice(invoice_id: str):
    path = Path(__file__).parent / "invoices" / f"{invoice_id}.pdf"
    if not path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(path, media_type="application/pdf", filename=f"{invoice_id}.pdf")


@app.post("/send-reminder")
def reminder(payload: ReminderIn):
    ok = send_reminder(payload.customer_name, payload.phone, payload.amount)
    return {"success": ok}
