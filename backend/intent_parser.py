"""Parse a voice transcript (Hindi/Kannada/Hinglish) into a structured intent.

Primary path: an LLM via OpenRouter. Fallback path: a regex + Hindi-number
heuristic so the app still logs entries when no API key is configured or the
network is down (important for offline kirana shops and live demos).
"""

import json
import os
import re

import httpx

LLM_MODEL = os.getenv("LLM_MODEL", "deepseek/deepseek-chat")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """You parse voice transcripts from an Indian kirana store owner. The speech is Hindi, Kannada, or Hinglish, often Romanized and code-mixed. Return ONLY one JSON object. No markdown, no prose.

Choose ONE type:
1. Credit/payment entry:
   {"type":"khata","customer_name":"","amount":0,"txn":"credit"|"payment","note":"","phone":null}
2. Invoice / bill:
   {"type":"invoice","customer_name":"","items":[{"name":"","qty":1,"rate":0,"gst":5}]}

Rules:
- "udhaar / baaki / likh do / khaata / le gaya / diya udhaar" => txn "credit" (customer owes the shop).
- "diya / chukaya / jama / paid / wapas / de diya / paise diye" => txn "payment" (customer paid the shop).
- Amounts: "do sau"=200, "dhai sau"=250, "paune do sau"=175, "150 rupaye", "ek hazaar"=1000.
- Quantities: "teen kilo @ 40" => qty 3 rate 40. "do packet".
- "bill / invoice / receipt / GST" with items => type invoice.
- Default gst 5 unless stated.
- Extract the customer's first name only as customer_name. Never invent a name; if absent use "".
- If a 10-digit phone number is spoken, put it in phone."""


# --- Hindi / Hinglish number words ---------------------------------------- #
_WORD_NUM = {
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "panch": 5, "paanch": 5,
    "chah": 6, "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
    "gyarah": 11, "barah": 12, "bees": 20, "pachas": 50, "pachaas": 50,
    "sau": 100, "hazaar": 1000, "hajaar": 1000,
}


def _words_to_amount(text: str) -> float:
    """Best-effort: turn 'do sau pachas' -> 250, 'dhai sau' -> 250."""
    t = text.lower()
    # special half/quarter forms
    t = t.replace("dhai", "2.5").replace("adhaai", "2.5").replace("sava", "+0.25 ")
    tokens = re.findall(r"[a-z]+|\d+\.?\d*", t)
    total = 0.0
    current = 0.0
    found = False
    for tok in tokens:
        if re.fullmatch(r"\d+\.?\d*", tok):
            current += float(tok)
            found = True
        elif tok in _WORD_NUM:
            val = _WORD_NUM[tok]
            found = True
            if val >= 100:
                current = (current or 1) * val
                total += current
                current = 0.0
            else:
                current += val
    total += current
    return total if found else 0.0


_PAYMENT_HINTS = ["chukaya", "chukaaya", "jama", "paid", "wapas", "de diya", "diye",
                  "diya paisa", "paise diye", "payment", "settle", "chukta"]
_CREDIT_HINTS = ["udhaar", "udhar", "baaki", "baki", "likh", "khaata", "khata",
                 "le gaya", "credit", "le liya"]


def _heuristic(transcript: str) -> dict:
    text = transcript.strip()
    low = text.lower()

    # amount: prefer explicit digits, else word numbers
    digit = re.search(r"(\d[\d,]*\.?\d*)", low)
    if digit:
        amount = float(digit.group(1).replace(",", ""))
    else:
        amount = _words_to_amount(low)

    txn = "payment" if any(h in low for h in _PAYMENT_HINTS) else "credit"

    # name: first capitalised token, else token before a credit/payment hint
    name = ""
    cap = re.findall(r"\b([A-Z][a-z]+)\b", text)
    stop = {"Rupaye", "Rupees", "Rs", "Udhaar", "Baaki"}
    cap = [c for c in cap if c not in stop]
    if cap:
        name = cap[0]
    else:
        m = re.match(r"\s*([a-zA-Z]+)", text)
        if m and m.group(1).lower() not in _WORD_NUM:
            name = m.group(1).capitalize()

    phone = None
    pm = re.search(r"\b([6-9]\d{9})\b", low)
    if pm:
        phone = pm.group(1)

    return {
        "type": "khata",
        "data": {
            "customer_name": name,
            "amount": amount,
            "txn": txn,
            "note": "",
            "phone": phone,
        },
    }


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    return m.group(0) if m else text


def _normalize(raw: dict) -> dict:
    kind = raw.get("type")
    if kind == "khata":
        txn = raw.get("txn") or "credit"
        txn = "payment" if str(txn).lower() == "payment" else "credit"
        return {
            "type": "khata",
            "data": {
                "customer_name": (raw.get("customer_name") or "").strip(),
                "amount": float(raw.get("amount") or 0),
                "txn": txn,
                "note": raw.get("note") or "",
                "phone": (str(raw["phone"]).strip() if raw.get("phone") else None),
            },
        }
    if kind == "invoice":
        items = []
        for it in raw.get("items", []) or []:
            items.append({
                "name": (it.get("name") or "").strip(),
                "qty": float(it.get("qty") or 1),
                "rate": float(it.get("rate") or 0),
                "gst": float(it.get("gst") if it.get("gst") is not None else 5),
            })
        return {
            "type": "invoice",
            "data": {
                "customer_name": (raw.get("customer_name") or "").strip(),
                "items": items,
            },
        }
    return {"type": "unknown", "data": {}}


def parse_intent(transcript: str) -> dict:
    """Parse transcript -> {type, data}. Falls back to a heuristic on any failure."""
    transcript = (transcript or "").strip()
    if not transcript:
        return {"type": "unknown", "data": {}}

    api_key = os.getenv("OPENROUTER_API_KEY")
    if api_key:
        try:
            resp = httpx.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"Transcript: {transcript}"},
                    ],
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            normalized = _normalize(json.loads(_strip_fences(content)))
            # If the model returned khata but missed the amount, patch from heuristic.
            if normalized["type"] == "khata" and not normalized["data"]["amount"]:
                normalized["data"]["amount"] = _heuristic(transcript)["data"]["amount"]
            if normalized["type"] != "unknown":
                return normalized
        except Exception as exc:  # pragma: no cover - network guard
            print(f"[intent_parser] LLM parse failed, using heuristic: {exc}")

    return _heuristic(transcript)
