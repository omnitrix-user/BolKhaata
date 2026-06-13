"""WhatsApp helpers.

Primary path: build a free ``wa.me`` deep link + a branded message that the
shopkeeper sends from their own WhatsApp (no API, no cost, works for everyone).
Optional path: if Twilio credentials are configured, also auto-send.
"""

import os
import re
from urllib.parse import quote

BRAND_PREFIX = "BolKhaata 🟡 |"


def _clean_phone(phone: str | None) -> str:
    """Normalise an Indian number to international form without '+': 91XXXXXXXXXX."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        digits = "91" + digits
    elif digits.startswith("0") and len(digits) == 11:
        digits = "91" + digits[1:]
    return digits


def reminder_message(shop_name: str, customer_name: str, amount: float) -> str:
    owed = abs(amount)
    name = customer_name or "ji"
    return (
        f"{BRAND_PREFIX} Namaste {name} 🙏\n"
        f"Aapka {shop_name} par ₹{owed:.0f} ka udhaar baaki hai. "
        f"Kripya jab sahuliyat ho, chukta kar dijiye.\n"
        f"Dhanyavaad!"
    )


def invoice_message(shop_name: str, customer_name: str, total: float, invoice_url: str | None = None) -> str:
    name = customer_name or "ji"
    msg = (
        f"{BRAND_PREFIX} Namaste {name} 🙏\n"
        f"{shop_name} se aapka bill ₹{total:.0f} ka ban gaya hai."
    )
    if invoice_url:
        msg += f"\nInvoice: {invoice_url}"
    msg += "\nDhanyavaad!"
    return msg


def wa_link(phone: str | None, message: str) -> str:
    """Build a wa.me deep link. If phone is missing, returns a chooser link."""
    digits = _clean_phone(phone)
    base = f"https://wa.me/{digits}" if digits else "https://wa.me/"
    return f"{base}?text={quote(message)}"


def try_twilio_send(phone: str | None, message: str) -> bool:
    """Auto-send via Twilio if configured. Never raises; returns delivery status."""
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_ = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    digits = _clean_phone(phone)
    if not (sid and token and digits):
        return False
    try:
        from twilio.rest import Client

        Client(sid, token).messages.create(
            body=message, from_=from_, to=f"whatsapp:+{digits}"
        )
        return True
    except Exception as exc:  # pragma: no cover - network guard
        print(f"[whatsapp] twilio send failed: {exc}")
        return False
