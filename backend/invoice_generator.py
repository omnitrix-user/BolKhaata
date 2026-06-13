"""GST tax-invoice PDF generation (ReportLab).

Includes the seller (shop) details required for a valid GST tax invoice and
splits tax into CGST + SGST (intra-state assumption, which covers the vast
majority of kirana-store sales).
"""

from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

INVOICE_DIR = Path(__file__).parent / "invoices"
INVOICE_DIR.mkdir(exist_ok=True)

# Brand palette
SAFFRON = colors.HexColor("#F5A623")
WARM_BLACK = colors.HexColor("#0F0E0C")
CHAI = colors.HexColor("#1A1814")
CREAM = colors.HexColor("#FBF6EC")
GREEN = colors.HexColor("#3F8F66")
BORDER = colors.HexColor("#D8C7AC")
GREY = colors.HexColor("#6B6356")


def generate_invoice_pdf(invoice: dict, shop: dict | None = None) -> tuple[str, float]:
    """Build a GST invoice PDF. Returns (file_path, grand_total)."""
    shop = shop or {}
    invoice_id = invoice.get("invoice_id") or f"INV{datetime.now():%y%m%d%H%M%S}"
    customer = invoice.get("customer_name", "Customer")
    date = invoice.get("date") or datetime.now().strftime("%d %b %Y")
    items = invoice.get("items", []) or []

    out_path = INVOICE_DIR / f"{invoice_id}.pdf"
    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=14 * mm, bottomMargin=16 * mm,
        title=f"Invoice {invoice_id}",
    )
    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    normal.fontSize = 9.5
    small = ParagraphStyle("small", parent=normal, fontSize=8, textColor=GREY)
    brand = ParagraphStyle("brand", parent=normal, fontName="Helvetica-Bold",
                           fontSize=20, leading=24, textColor=WARM_BLACK)
    brand_sub = ParagraphStyle("brandsub", parent=small, textColor=SAFFRON,
                               fontName="Helvetica-Bold", fontSize=8, leading=10)
    right = ParagraphStyle("right", parent=normal, alignment=TA_RIGHT)
    right_small = ParagraphStyle("rsmall", parent=small, alignment=TA_RIGHT)

    story = []

    shop_name = shop.get("name") or "BolKhaata"
    seller_lines = [Paragraph(shop_name, brand), Spacer(1, 1.5 * mm),
                   Paragraph("Powered by BolKhaata", brand_sub)]
    if shop.get("address"):
        seller_lines.append(Paragraph(shop["address"], small))
    contact = []
    if shop.get("phone"):
        contact.append(f"Ph: {shop['phone']}")
    if shop.get("gstin"):
        contact.append(f"GSTIN: {shop['gstin']}")
    if contact:
        seller_lines.append(Paragraph("  ".join(contact), small))

    meta = [
        Paragraph("<b>TAX INVOICE</b>", ParagraphStyle("ti", parent=right, fontSize=13)),
        Paragraph(f"Invoice No: <b>{invoice_id}</b>", right_small),
        Paragraph(f"Date: {date}", right_small),
    ]

    head = Table([[seller_lines, meta]], colWidths=[100 * mm, 78 * mm])
    head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, SAFFRON),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(head)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph(f"<b>Billed To:</b> {customer}", normal))
    story.append(Spacer(1, 4 * mm))

    no_gst = shop.get("business_type") == "street_vendor"
    default_gst = 0 if no_gst else float(shop.get("gst_rate") or 5)

    if no_gst:
        header = ["#", "Item", "Qty", "Rate", "Amount"]
        col_widths = [10*mm, 78*mm, 22*mm, 28*mm, 30*mm]
    else:
        header = ["#", "Item", "Qty", "Rate", "Taxable", "GST%", "CGST", "SGST", "Amount"]
        col_widths = [8*mm, 44*mm, 14*mm, 18*mm, 22*mm, 14*mm, 16*mm, 16*mm, 22*mm]
    rows = [header]
    subtotal = tax_total = 0.0
    for i, it in enumerate(items, 1):
        qty = float(it.get("qty") or 0)
        rate = float(it.get("rate") or 0)
        gst = 0 if no_gst else float(it.get("gst") if it.get("gst") is not None else default_gst)
        taxable = round(qty * rate, 2)
        gst_amt = round(taxable * gst / 100, 2)
        half = round(gst_amt / 2, 2)
        amount = round(taxable + gst_amt, 2)
        subtotal += taxable
        tax_total += gst_amt
        if no_gst:
            rows.append([str(i), it.get("name", ""), f"{qty:g}", f"{rate:.2f}", f"{amount:.2f}"])
        else:
            rows.append([
                str(i), it.get("name", ""), f"{qty:g}", f"{rate:.2f}",
                f"{taxable:.2f}", f"{gst:g}", f"{half:.2f}", f"{half:.2f}", f"{amount:.2f}",
            ])

    subtotal = round(subtotal, 2)
    tax_total = round(tax_total, 2)
    grand_total = round(subtotal + tax_total, 2)

    table = Table(rows, repeatRows=1, hAlign="LEFT", colWidths=col_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), WARM_BLACK),
        ("TEXTCOLOR", (0, 0), (-1, 0), CREAM),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (1, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)
    story.append(Spacer(1, 5 * mm))

    if no_gst:
        totals_data = [["Total", f"Rs. {grand_total:.2f}"]]
    else:
        totals_data = [
            ["Subtotal (Taxable)", f"Rs. {subtotal:.2f}"],
            ["CGST", f"Rs. {tax_total/2:.2f}"],
            ["SGST", f"Rs. {tax_total/2:.2f}"],
            ["Grand Total", f"Rs. {grand_total:.2f}"],
        ]
    totals = Table(totals_data, colWidths=[44 * mm, 38 * mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TEXTCOLOR", (0, 0), (-1, -2), GREY),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 12),
        ("TEXTCOLOR", (0, -1), (-1, -1), WARM_BLACK),
        ("BACKGROUND", (0, -1), (-1, -1), SAFFRON),
        ("LINEABOVE", (0, -1), (-1, -1), 1, WARM_BLACK),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(totals)
    story.append(Spacer(1, 12 * mm))

    foot = ParagraphStyle("foot", parent=small, alignment=TA_CENTER)
    story.append(Paragraph("Dhanyavaad!  Thank you for your business.", foot))
    story.append(Paragraph("Generated with BolKhaata - Aapka khata, aapki awaaz.", foot))

    doc.build(story)
    return str(out_path), grand_total
