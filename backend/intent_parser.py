"""Parse a voice transcript (Hindi/Kannada/Hinglish) into a structured intent.

Resolution order (each step falls through on failure):
  1. A local LLM via Ollama  — free, private, offline, no API key (preferred).
  2. A hosted LLM via OpenRouter — only if OPENROUTER_API_KEY is set.
  3. A regex + Hindi-number heuristic — always available, zero dependencies,
     so the app still works on a budget phone with no model and no network.
"""

import json
import os
import re

import httpx

LLM_MODEL = os.getenv("LLM_MODEL", "deepseek/deepseek-chat")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Local LLM (Ollama). Install: https://ollama.com  then  `ollama pull qwen2.5:1.5b`.
# Set USE_OLLAMA=0 to skip it entirely.
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")

SYSTEM_PROMPT = """You parse voice transcripts from an Indian kirana store owner. The speech is Hindi, Kannada, or Hinglish, often Romanized and code-mixed. Return ONLY one JSON object. No markdown, no prose.

Two possible types:
1. Credit/payment entry (ledger / khata):
   {"type":"khata","customer_name":"","amount":0,"txn":"credit"|"payment","note":"","phone":null}
2. Invoice / bill (itemised sale):
   {"type":"invoice","customer_name":"","items":[{"name":"","qty":1,"rate":0,"gst":5}]}

Decide the TYPE first:
- If the owner is recording money owed or paid - words like "udhaar, baaki, likh/likho/likh do, jama, diya, paid, wapas, de diya, chukaya, le gaya" - use type "khata", EVEN IF a good is mentioned (put the good in "note"). One lump amount with no per-item prices is almost always "khata".
- Use type "invoice" ONLY when they ask to make a bill/invoice/receipt, OR clearly describe buying multiple itemised goods with prices and NO credit/payment word above.

khata rules:
- "udhaar / baaki / likh do / le gaya / diya udhaar" => txn "credit" (customer owes the shop).
- "diya / chukaya / jama / paid / wapas / de diya / paise diye" => txn "payment" (customer paid the shop).
- amount is in rupees: "do sau"=200, "dhai sau"=250, "paune do sau"=175, "150 rupaye", "ek hazaar"=1000.

invoice rules:
- Each item: name, qty, rate (price PER UNIT in rupees), gst (a PERCENT like 5 or 18 - never a fraction like 0.05).
- "teen kilo @ 40" => qty 3, rate 40. "do packet 25 each" => qty 2, rate 25.
- If a line TOTAL is given for a quantity ("2 kg flour in 200") set rate = total / qty, so qty*rate equals the total.
- Default gst 5 unless stated.

Both types:
- Extract the customer's full name as spoken (given name plus surname if present) as customer_name. Never invent a name; if absent use "".
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

# Words that can never be part of a customer name (so the leading-name run stops
# at them). Kept in sync with the front-end command matcher's fillers.
_NAME_STOP = {
    "ko", "ne", "se", "ka", "ki", "ke", "kaa", "kii", "naam", "wala", "wale",
    "rupaye", "rupees", "rupee", "rs", "rupay", "bill", "invoice", "receipt",
    "gst", "udhaar", "udhar", "baaki", "baki", "likh", "likho", "likhdo",
    "diya", "diye", "jama", "paid", "wapas", "chukaya", "chukaaya", "credit",
    "payment", "settle", "khaata", "khata", "ledger", "for", "to", "the",
    "bought", "buy", "purchased", "purchase", "kharida", "kharidi", "kharide",
    "ordered", "order", "wants", "want", "becha", "bechi", "sold", "took",
    "gave", "le", "liya", "liye", "gaya", "chahiye",
}

# --- Invoice line-item parsing (offline path) ----------------------------- #
_INVOICE_KEYWORDS = ["bill", "invoice", "receipt", "gst", "बिल", "रसीद", "ರಸೀದಿ", "ಬಿಲ್"]
_PURCHASE_VERBS = ["bought", "buy", "purchase", "kharid", "order", "becha", "sold"]
_UNITS = {"kilo", "kilos", "kg", "kgs", "gram", "grams", "gm", "gms", "g",
          "packet", "packets", "pkt", "piece", "pieces", "pcs", "pc", "dozen",
          "litre", "liter", "ltr", "l", "ml", "box", "boxes", "bori", "bag",
          "bags", "dabba", "nag", "quintal"}
_RUPEE = {"rupaye", "rupees", "rupee", "rs", "rupay", "paisa", "paise"}
# A price after these is a LINE TOTAL ("flour in 200" = 200 for the lot); after
# these it is a PER-UNIT rate ("at 30 each" = 30 apiece). A bare trailing number
# is treated as a per-unit rate (the common "3 kilo aata 40" shape).
_TOTAL_PREP = {"in", "for", "mein", "total"}
_RATE_PREP = {"each", "per", "at", "bhaav"}
_ITEM_DROP = {"of", "ka", "ki", "ke", "ko", "wala", "wale", "liye", "and", "aur",
              "rate", "price", "banao", "banado", "bana", "the", "a", "an"}
# Particles/verbs to strip from the FRONT of the goods region (after the name).
_LEAD_DROP = {
    "ne", "ka", "ke", "ki", "ko", "bought", "buy", "purchased", "purchase",
    "kharida", "kharidi", "kharide", "liya", "liye", "le", "gaya", "wants",
    "want", "ordered", "order", "chahiye", "bill", "invoice", "receipt",
    "banao", "banado", "bana", "of", "for", "took", "gave", "sold", "becha",
}


def _extract_name(text: str) -> str:
    """Customer name: the leading run of name tokens before the first stop-signal
    (a keyword, a unit, or a number — anything past which we're into goods/amounts).
    Falls back to leading capitalised tokens when the name trails the action
    (e.g. 'paid 200 by Sunita')."""
    tokens = re.findall(r"[A-Za-z]+", text)
    run = []
    for tok in tokens:
        low = tok.lower()
        if low in _NAME_STOP or low in _WORD_NUM or low in _UNITS:
            break
        run.append(tok)
    if run:
        return " ".join(w.capitalize() for w in run[:3])
    caps = [c for c in re.findall(r"\b([A-Z][a-z]+)\b", text)
            if c.lower() not in _NAME_STOP and c.lower() not in _UNITS]
    return " ".join(caps[:2])


def _trailing_customer(text: str):
    """A customer named at the END of the phrase: '... for Imran', '... ke liye Anil'.
    Only treats it as a name when a real word (not a price/unit) follows 'for'."""
    m = re.search(r"\b(?:for|ke liye|liye)\s+([A-Za-z][A-Za-z ]*?)\s*$", text, flags=re.I)
    if not m:
        return None
    words = [w for w in m.group(1).split()
             if w.lower() not in _UNITS and w.lower() not in _ITEM_DROP and w.lower() not in _RUPEE]
    return " ".join(w.capitalize() for w in words[:3]) if words else None


def _split_clauses(text: str):
    return re.split(r",|;|\band\b|\baur\b|\bplus\b", text, flags=re.I)


def _parse_clause(clause: str):
    """One item phrase -> {name, qty, rate, gst} with qty*rate == the intended line
    total. 'in/for N' is a total (rate = N/qty); 'at/per/each N', 'N rupaye', or a
    bare trailing N is a per-unit rate."""
    toks = re.findall(r"[A-Za-z]+|\d+\.?\d*", clause.strip())
    n = len(toks)
    qty = total = rate = None
    name_words = []
    for i, tok in enumerate(toks):
        low = tok.lower()
        prev = toks[i - 1].lower() if i > 0 else ""
        nxt = toks[i + 1].lower() if i + 1 < n else ""
        if re.fullmatch(r"\d+\.?\d*", tok):
            val = float(tok)
            if nxt in _UNITS:                         # "2 kg ..." -> quantity
                qty = val
            elif prev in _TOTAL_PREP:                 # "... in 200" -> line total
                total = val
            elif prev in _RATE_PREP or nxt in _RATE_PREP or nxt in _RUPEE:
                rate = val                            # "at 30", "30 each", "40 rupaye"
            elif rate is None and total is None:       # bare price -> per-unit rate
                rate = val
            elif qty is None:
                qty = val
        elif low in _WORD_NUM and _WORD_NUM[low] < 100:
            qty = float(_WORD_NUM[low])               # "do / teen ..." -> quantity
        elif low in _UNITS or low in _RUPEE or low in _TOTAL_PREP \
                or low in _RATE_PREP or low in _ITEM_DROP:
            continue
        else:
            name_words.append(tok)
    name = " ".join(name_words).strip()
    if not name:
        return None
    if qty is None:
        qty = 1.0
    if rate is None and total is not None:
        rate = round(total / qty, 2) if qty else total
    if rate is None:
        rate = 0.0
    return {"name": name.title(), "qty": qty, "rate": rate, "gst": 5}


def _extract_items(region: str) -> list:
    items = []
    for clause in _split_clauses(region):
        it = _parse_clause(clause)
        if it:
            items.append(it)
    return items


def _looks_like_invoice(low: str, tokens: list) -> bool:
    """Invoice when there's a bill keyword, OR a purchase verb with a number, OR a
    unit + number with no credit/payment hint (a sale of goods, not a ledger note)."""
    if any(k in low for k in _INVOICE_KEYWORDS):
        return True
    has_digit = any(re.fullmatch(r"\d+\.?\d*", t) for t in tokens)
    if has_digit and any(v in low for v in _PURCHASE_VERBS):
        return True
    has_unit = any(t.lower() in _UNITS for t in tokens)
    has_ledger = any(h in low for h in _CREDIT_HINTS + _PAYMENT_HINTS)
    return bool(has_digit and has_unit and not has_ledger)


def _items_region(text: str, low: str, name: str) -> str:
    """Reduce the transcript to just the goods: after a bill keyword take the rest,
    then strip a leading customer name and any purchase verbs/particles."""
    region = text
    for kw in _INVOICE_KEYWORDS:
        idx = low.find(kw)
        if idx != -1:
            region = text[idx + len(kw):]
            break
    # strip a trailing "for <Name>" / "ke liye <Name>" customer clause (but not
    # "for 250", a price — that needs a letter after 'for').
    region = re.sub(r"\b(?:for|ke liye|liye)\s+[A-Za-z][A-Za-z ]*$", "", region, flags=re.I).strip()
    name_tokens = {w.lower() for w in name.split()} if name else set()
    words = region.split()
    while words:
        head = re.sub(r"[^\w]", "", words[0].lower())
        if head and (head in _LEAD_DROP or head in name_tokens):
            words.pop(0)
        else:
            break
    return " ".join(words)


def _heuristic(transcript: str) -> dict:
    text = transcript.strip()
    low = text.lower()
    tokens = re.findall(r"[A-Za-z]+|\d+\.?\d*", text)

    phone = None
    pm = re.search(r"\b([6-9]\d{9})\b", low)
    if pm:
        phone = pm.group(1)

    name = _extract_name(text) or _trailing_customer(text) or ""

    if _looks_like_invoice(low, tokens):
        region = _items_region(text, low, name)
        items = [it for it in _extract_items(region)
                 if not name or it["name"].lower() != name.lower()]
        return {"type": "invoice", "data": {"customer_name": name, "items": items, "phone": phone}}

    # Ledger entry — amount: explicit digits, else Hindi word-numbers.
    digit = re.search(r"(\d[\d,]*\.?\d*)", low)
    amount = float(digit.group(1).replace(",", "")) if digit else _words_to_amount(low)
    txn = "payment" if any(h in low for h in _PAYMENT_HINTS) else "credit"
    return {
        "type": "khata",
        "data": {"customer_name": name, "amount": amount, "txn": txn, "note": "", "phone": phone},
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
            gst = it.get("gst")
            gst = 5.0 if gst is None else float(gst)
            if 0 < gst < 1:  # model returned a fraction (0.05) -> percent (5)
                gst *= 100
            items.append({
                "name": (it.get("name") or "").strip(),
                "qty": float(it.get("qty") or 1),
                "rate": float(it.get("rate") or 0),
                "gst": gst,
            })
        return {
            "type": "invoice",
            "data": {
                "customer_name": (raw.get("customer_name") or "").strip(),
                "items": items,
                "phone": (str(raw["phone"]).strip() if raw.get("phone") else None),
            },
        }
    return {"type": "unknown", "data": {}}


def _reconcile_txn(transcript: str, txn: str) -> str:
    """A small LLM can flip credit/payment on tricky phrasing ('baaki hai' = owed).
    When the transcript carries an UNAMBIGUOUS keyword (a credit word and no
    payment word, or vice-versa) that contradicts the model, trust the keyword.
    If both or neither appear, keep the model's call."""
    low = transcript.lower()
    has_credit = any(h in low for h in _CREDIT_HINTS)
    has_payment = any(h in low for h in _PAYMENT_HINTS)
    if has_credit and not has_payment:
        return "credit"
    if has_payment and not has_credit:
        return "payment"
    return txn


def _refine_khata(normalized: dict, transcript: str) -> dict:
    """Patch a model khata: fill a missing amount from the heuristic (regex is
    reliably good at numbers) and correct an obviously-wrong txn direction."""
    if normalized["type"] == "khata":
        d = normalized["data"]
        if not d.get("amount"):
            d["amount"] = _heuristic(transcript)["data"]["amount"]
        d["txn"] = _reconcile_txn(transcript, d["txn"])
    return normalized


def _try_ollama(transcript: str):
    """Local Ollama model — no API key, no cost, runs offline. Returns a normalized
    intent, or None if Ollama isn't running / the model isn't pulled / it errored.
    A short connect timeout means 'not installed' costs nothing (refused instantly)."""
    try:
        resp = httpx.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Transcript: {transcript}"},
                ],
                "stream": False,
                "format": "json",
                "options": {"temperature": 0},
            },
            timeout=httpx.Timeout(30.0, connect=2.0),
        )
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        normalized = _normalize(json.loads(_strip_fences(content)))
        if normalized["type"] != "unknown":
            return _refine_khata(normalized, transcript)
    except httpx.ConnectError:
        pass  # Ollama not running — silent, expected fallback.
    except Exception as exc:  # pragma: no cover - network/model guard
        print(f"[intent_parser] Ollama parse failed ({OLLAMA_MODEL}): {exc}")
    return None


def _try_openrouter(transcript: str):
    """Hosted LLM via OpenRouter — only if a key is set. Returns normalized or None."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return None
    try:
        resp = httpx.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
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
        if normalized["type"] != "unknown":
            return _refine_khata(normalized, transcript)
    except Exception as exc:  # pragma: no cover - network guard
        print(f"[intent_parser] OpenRouter parse failed: {exc}")
    return None


def parse_intent(transcript: str) -> dict:
    """Parse transcript -> {type, data}. Local LLM first, then hosted LLM, then the
    always-available heuristic — every step falls through to the next on failure."""
    transcript = (transcript or "").strip()
    if not transcript:
        return {"type": "unknown", "data": {}}

    if os.getenv("USE_OLLAMA", "1") != "0":
        result = _try_ollama(transcript)
        if result:
            return result

    result = _try_openrouter(transcript)
    if result:
        return result

    return _heuristic(transcript)
