from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

INVOICE_DIR = Path(__file__).parent / "invoices"
INVOICE_DIR.mkdir(exist_ok=True)

SAFFRON = colors.HexColor("#F4A300")
DARK = colors.HexColor("#1C140D")
CREAM = colors.HexColor("#FBF3E2")


def generate_invoice_pdf(invoice: dict) -> tuple[str, float]:
    """Build a GST invoice PDF. Returns (file_path, grand_total)."""
    invoice_id = invoice.get("invoice_id") or f"INV{datetime.now():%y%m%d%H%M%S}"
    customer = invoice.get("customer_name", "Customer")
    date = invoice.get("date") or datetime.now().strftime("%d %b %Y")
    items = invoice.get("items", []) or []

    out_path = INVOICE_DIR / f"{invoice_id}.pdf"
    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    title = styles["Title"]
    title.textColor = DARK
    normal = styles["Normal"]

    story = []
    story.append(Paragraph("BolKhaata", title))
    story.append(Paragraph("GST Tax Invoice", styles["Heading2"]))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(f"<b>Invoice No:</b> {invoice_id}", normal))
    story.append(Paragraph(f"<b>Date:</b> {date}", normal))
    story.append(Paragraph(f"<b>Billed To:</b> {customer}", normal))
    story.append(Spacer(1, 6 * mm))

    header = ["Item", "Qty", "Rate", "Taxable", "GST%", "GST Amt", "Amount"]
    rows = [header]
    subtotal = 0.0
    tax_total = 0.0
    for it in items:
        qty = float(it.get("qty") or 0)
        rate = float(it.get("rate") or 0)
        gst = float(it.get("gst") if it.get("gst") is not None else 5)
        taxable = qty * rate
        gst_amt = round(taxable * gst / 100, 2)
        amount = round(taxable + gst_amt, 2)
        subtotal += taxable
        tax_total += gst_amt
        rows.append([
            it.get("name", ""),
            f"{qty:g}",
            f"{rate:.2f}",
            f"{taxable:.2f}",
            f"{gst:g}",
            f"{gst_amt:.2f}",
            f"{amount:.2f}",
        ])

    grand_total = round(subtotal + tax_total, 2)

    table = Table(rows, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SAFFRON),
        ("TEXTCOLOR", (0, 0), (-1, 0), DARK),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C9B79C")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    story.append(Spacer(1, 6 * mm))

    totals = Table(
        [
            ["Subtotal", f"Rs. {subtotal:.2f}"],
            ["Total GST", f"Rs. {tax_total:.2f}"],
            ["Grand Total", f"Rs. {grand_total:.2f}"],
        ],
        colWidths=[40 * mm, 40 * mm],
        hAlign="RIGHT",
    )
    totals.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, DARK),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals)
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph("Dhanyavaad! / Thank you for your business.", normal))

    doc.build(story)
    return str(out_path), grand_total
