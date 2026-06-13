import os


def send_reminder(customer_name: str, phone: str | None, amount: float) -> bool:
    """Send a WhatsApp payment reminder via Twilio.

    Always degrades gracefully: returns False on any failure or missing config,
    never raises.
    """
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_ = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    if not (sid and token and phone):
        print("[whatsapp] missing config or phone; skipping reminder")
        return False
    try:
        from twilio.rest import Client

        owed = abs(amount)
        body = (
            f"Namaste {customer_name}, aapka {owed:.0f} rupaye ka udhaar baaki hai. "
            f"Kripya jaldi chukta karein. Dhanyavaad! - BolKhaata"
        )
        to = phone if phone.startswith("whatsapp:") else f"whatsapp:{phone}"
        Client(sid, token).messages.create(body=body, from_=from_, to=to)
        return True
    except Exception as exc:  # pragma: no cover - network/runtime guard
        print(f"[whatsapp] reminder failed: {exc}")
        return False
