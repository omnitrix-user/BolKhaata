import json
import os
import re

import httpx

LLM_MODEL = os.getenv("LLM_MODEL", "deepseek/deepseek-chat")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """You parse voice transcripts from an Indian kirana store owner (Hindi/Kannada, often Romanized or code-mixed). Return ONLY one JSON object, no markdown, no prose.

Credit/payment -> {"type":"khata","customer_name":"","amount":0,"txn":"credit"|"payment","note":"","phone":null}
Invoice -> {"type":"invoice","items":[{"name":"","qty":0,"rate":0,"gst":5}]}

Rules:
- "udhaar / baaki / likh do / khaata" => credit. "diya / chukaya / paid" => payment.
- Extract amounts written as "do sau / 200 rupaye / teen kilo @ 40".
- Default gst 5 unless stated.
- If unsure of a field, use empty string / 0 / null. Never invent a name.

Transcript: {transcript}"""


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    return m.group(0) if m else text


def _normalize(raw: dict) -> dict:
    """Map the LLM JSON to the {type, data} contract the UI expects."""
    kind = raw.get("type")
    if kind == "khata":
        txn = raw.get("txn") or raw.get("type_txn") or "credit"
        txn = "payment" if str(txn).lower() == "payment" else "credit"
        return {
            "type": "khata",
            "data": {
                "customer_name": (raw.get("customer_name") or "").strip(),
                "amount": float(raw.get("amount") or 0),
                "txn": txn,
                "note": raw.get("note") or "",
                "phone": raw.get("phone"),
            },
        }
    if kind == "invoice":
        items = []
        for it in raw.get("items", []) or []:
            items.append(
                {
                    "name": (it.get("name") or "").strip(),
                    "qty": int(it.get("qty") or 0),
                    "rate": float(it.get("rate") or 0),
                    "gst": float(it.get("gst") if it.get("gst") is not None else 5),
                }
            )
        return {"type": "invoice", "data": {"items": items}}
    return {"type": "unknown", "data": {}}


def parse_intent(transcript: str) -> dict:
    """Parse a transcript into {type, data}. Returns {'type':'unknown'} on any failure."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key or not transcript.strip():
        return {"type": "unknown", "data": {}}
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
                    {
                        "role": "user",
                        "content": SYSTEM_PROMPT.format(transcript=transcript),
                    }
                ],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        raw = json.loads(_strip_fences(content))
        return _normalize(raw)
    except Exception as exc:  # pragma: no cover - network/runtime guard
        print(f"[intent_parser] parse failed: {exc}")
        return {"type": "unknown", "data": {}}
