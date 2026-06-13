"""Render a GST/POS invoice as a JPG image with a UPI payment QR code.

Used for in-app preview, JPG download, and WhatsApp image sharing. Respects the
shop's business_type (street_vendor => no GST) and stored gst_rate.
"""

from pathlib import Path
from urllib.parse import quote

import qrcode
from PIL import Image, ImageDraw, ImageFont

INVOICE_DIR = Path(__file__).parent / "invoices"
INVOICE_DIR.mkdir(exist_ok=True)

WARM_BLACK = (15, 14, 12)
SAFFRON = (245, 166, 35)
CREAM = (251, 246, 236)
GREY = (107, 99, 86)
LINE = (216, 199, 172)
GREEN = (63, 143, 102)
WHITE = (255, 255, 255)

_FONT = "/System/Library/Fonts/Helvetica.ttc"


def _font(size, bold=False):
    try:
        return ImageFont.truetype(_FONT, size, index=1 if bold else 0)
    except Exception:
        return ImageFont.load_default()


def _upi_string(shop, total):
    pa = (shop.get("upi_id") or "").strip()
    pn = quote(shop.get("name") or "BolKhaata")
    if pa:
        return f"upi://pay?pa={pa}&pn={pn}&am={total:.2f}&cu=INR"
    # No VPA configured — still produce a scannable info QR.
    return f"BolKhaata Invoice | {shop.get('name','')} | Amount ₹{total:.2f}"


def generate_invoice_image(invoice: dict, shop: dict | None = None) -> tuple[str, float]:
    shop = shop or {}
    inv_id = invoice.get("invoice_id") or "INV"
    customer = invoice.get("customer_name", "Customer")
    date = invoice.get("date") or ""
    items = invoice.get("items", []) or []
    no_gst = shop.get("business_type") == "street_vendor"
    default_gst = 0 if no_gst else float(shop.get("gst_rate") or 5)

    W, M = 1000, 56
    rows = []
    subtotal = tax_total = 0.0
    for it in items:
        qty = float(it.get("qty") or 0)
        rate = float(it.get("rate") or 0)
        gst = 0 if no_gst else float(it.get("gst") if it.get("gst") is not None else default_gst)
        taxable = round(qty * rate, 2)
        gst_amt = round(taxable * gst / 100, 2)
        amount = round(taxable + gst_amt, 2)
        subtotal += taxable
        tax_total += gst_amt
        rows.append((it.get("name", ""), qty, rate, gst, amount))
    subtotal = round(subtotal, 2)
    tax_total = round(tax_total, 2)
    grand = round(subtotal + tax_total, 2)

    # height estimate
    H = 300 + len(rows) * 46 + (90 if no_gst else 150) + 320
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    f_brand = _font(42, True)
    f_h = _font(26, True)
    f = _font(22)
    f_s = _font(18)
    f_big = _font(34, True)

    # header band
    d.rectangle([0, 0, W, 150], fill=WARM_BLACK)
    d.text((M, 40), shop.get("name") or "BolKhaata", font=f_brand, fill=CREAM)
    sub = []
    if shop.get("address"):
        sub.append(shop["address"])
    line2 = []
    if shop.get("phone"):
        line2.append(f"Ph: {shop['phone']}")
    if shop.get("gstin") and not no_gst:
        line2.append(f"GSTIN: {shop['gstin']}")
    if sub:
        d.text((M, 95), sub[0], font=f_s, fill=(200, 192, 180))
    if line2:
        d.text((M, 118), "   ".join(line2), font=f_s, fill=(200, 192, 180))
    label = "INVOICE" if no_gst else "TAX INVOICE"
    d.text((W - M - d.textlength(label, font=f_h), 50), label, font=f_h, fill=SAFFRON)
    d.text((W - M - d.textlength(f"No: {inv_id}", font=f_s), 90), f"No: {inv_id}", font=f_s, fill=CREAM)
    d.text((W - M - d.textlength(date, font=f_s), 115), date, font=f_s, fill=CREAM)

    y = 185
    d.text((M, y), f"Billed To: {customer}", font=f, fill=WARM_BLACK)
    y += 44

    # table header
    if no_gst:
        cols = [(M, "Item"), (560, "Qty"), (680, "Rate"), (W - M - 130, "Amount")]
    else:
        cols = [(M, "Item"), (500, "Qty"), (600, "Rate"), (720, "GST%"), (W - M - 130, "Amount")]
    d.rectangle([M - 12, y - 6, W - M + 12, y + 34], fill=WARM_BLACK)
    for x, txt in cols:
        d.text((x, y), txt, font=f_s, fill=CREAM)
    y += 46

    for i, (name, qty, rate, gst, amount) in enumerate(rows):
        if i % 2:
            d.rectangle([M - 12, y - 8, W - M + 12, y + 30], fill=CREAM)
        d.text((M, y), name[:38], font=f, fill=WARM_BLACK)
        if no_gst:
            d.text((560, y), f"{qty:g}", font=f, fill=WARM_BLACK)
            d.text((680, y), f"{rate:.2f}", font=f, fill=WARM_BLACK)
        else:
            d.text((500, y), f"{qty:g}", font=f, fill=WARM_BLACK)
            d.text((600, y), f"{rate:.2f}", font=f, fill=WARM_BLACK)
            d.text((720, y), f"{gst:g}%", font=f, fill=WARM_BLACK)
        amt = f"₹{amount:.2f}"
        d.text((W - M - d.textlength(amt, font=f), y), amt, font=f, fill=WARM_BLACK)
        y += 46

    y += 10
    d.line([(560, y), (W - M, y)], fill=LINE, width=2)
    y += 16

    def total_row(lbl, val, bold=False, bg=None):
        nonlocal y
        ft = f if not bold else f_big
        if bg:
            d.rectangle([560, y - 8, W - M + 12, y + (44 if bold else 32)], fill=bg)
        d.text((580, y), lbl, font=(f_s if not bold else f_h), fill=(WARM_BLACK if bg else GREY))
        vt = f"₹{val:.2f}"
        d.text((W - M - d.textlength(vt, font=ft), y), vt, font=ft, fill=WARM_BLACK)
        y += (52 if bold else 34)

    if not no_gst:
        total_row("Subtotal", subtotal)
        total_row("CGST", tax_total / 2)
        total_row("SGST", tax_total / 2)
    total_row("Total" if no_gst else "Grand Total", grand, bold=True, bg=SAFFRON)

    # payment section + QR
    y += 24
    box_top = y
    qr = qrcode.make(_upi_string(shop, grand)).resize((200, 200))
    img.paste(qr, (M, box_top + 20))
    d.rectangle([M - 16, box_top, W - M + 12, box_top + 240], outline=GREEN, width=3)
    px = M + 240
    d.text((px, box_top + 24), "Scan & Pay", font=f_h, fill=GREEN)
    pay_amt = f"₹{grand:.2f}"
    d.text((px, box_top + 64), pay_amt, font=f_big, fill=WARM_BLACK)
    if shop.get("upi_id"):
        d.text((px, box_top + 116), f"UPI: {shop['upi_id']}", font=f_s, fill=GREY)
        d.text((px, box_top + 142), "Pay via any UPI app", font=f_s, fill=GREY)
    else:
        d.text((px, box_top + 116), "Add UPI ID in Settings", font=f_s, fill=GREY)
        d.text((px, box_top + 142), "to enable instant pay", font=f_s, fill=GREY)
    d.text((px, box_top + 188), "Generated with BolKhaata", font=f_s, fill=SAFFRON)

    out = INVOICE_DIR / f"{inv_id}.jpg"
    img.save(out, "JPEG", quality=90)
    return str(out), grand
