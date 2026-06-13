import { api } from '../api'

function invoiceMessage(inv, shop) {
  const name = inv.customer_name || 'ji'
  const lines = [
    `🧾 *${shop?.name || 'BolKhaata'}*`,
    `Namaste ${name} 🙏`,
    '',
    'Aapka bill taiyaar hai 👇',
  ]
  ;(inv.items || []).slice(0, 8).forEach((it) => {
    const qty = it.qty ? `${it.qty} × ` : ''
    lines.push(`• ${it.name} — ${qty}₹${Number(it.rate || 0).toFixed(0)}`)
  })
  lines.push('', `💰 *Total: ₹${Math.round(inv.total)}*`)
  if (shop?.upi_id) {
    lines.push('', `💳 UPI: ${shop.upi_id}`, 'Bill par QR scan karke turant pay karein 📲')
  } else {
    lines.push('', '📲 Bill par diye QR ko scan karke pay karein.')
  }
  lines.push('', 'Dhanyavaad! 🙏', `— ${shop?.name || 'BolKhaata'}`)
  return lines.join('\n')
}

// Share the invoice JPG + a professional message. Uses the Web Share API
// (attaches the actual image, e.g. to WhatsApp) when available; otherwise
// falls back to a wa.me text link.
export async function shareInvoice(inv, shop) {
  const message = invoiceMessage(inv, shop)
  try {
    const blob = await api.invoiceImageBlob(inv.invoice_id)
    const file = new File([blob], `${inv.invoice_id}.jpg`, { type: 'image/jpeg' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: message, title: 'Invoice' })
      return
    }
  } catch (e) {
    if (e?.name === 'AbortError') return // user cancelled the share sheet
  }
  // Fallback: open WhatsApp with the message (link to the image).
  const text = `${message}\n\n${api.invoiceImageUrl(inv.invoice_id)}`
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
}

// Trigger a JPG download of the invoice image.
export async function downloadInvoiceJpg(inv) {
  try {
    const blob = await api.invoiceImageBlob(inv.invoice_id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${inv.invoice_id}.jpg`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  } catch {
    window.open(api.invoiceImageUrl(inv.invoice_id), '_blank')
  }
}
