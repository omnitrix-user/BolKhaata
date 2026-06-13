import { api } from '../api'

function invoiceMessage(inv, shop, withLink = false) {
  const name = inv.customer_name || 'ji'
  const lines = [
    `🧾 ${shop?.name || 'BolKhaata'}`,
    `Namaste ${name} 🙏`,
    '',
    'Aapka bill taiyaar hai:',
  ]
  ;(inv.items || []).slice(0, 8).forEach((it) => {
    const qty = it.qty ? `${it.qty} x ` : ''
    lines.push(`• ${it.name} — ${qty}₹${Number(it.rate || 0).toFixed(0)}`)
  })
  lines.push('', `💰 Total: ₹${Math.round(inv.total)}`)
  if (shop?.upi_id) lines.push(`💳 UPI: ${shop.upi_id} (bill par QR scan karein)`)
  lines.push('', 'Dhanyavaad! 🙏')
  if (withLink) lines.push('', api.invoiceImageUrl(inv.invoice_id))
  return lines.join('\n')
}

// Share the invoice as an IMAGE. Web Share API attaches the real JPG (Android/
// iOS, the actual target devices) with no link. Where files can't be shared
// (most desktops), we auto-download the JPG so the user can attach it, and open
// WhatsApp with the message — the link is included only in that fallback.
export async function shareInvoice(inv, shop) {
  let file = null
  try {
    const blob = await api.invoiceImageBlob(inv.invoice_id)
    file = new File([blob], `${inv.invoice_id}.jpg`, { type: 'image/jpeg' })
  } catch { /* fall through to link */ }

  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: invoiceMessage(inv, shop), title: 'Invoice' })
      return 'image'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }

  // Desktop fallback: download the image (so it can be attached) + open WhatsApp.
  if (file) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(invoiceMessage(inv, shop, true))}`, '_blank')
  return 'fallback'
}

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
