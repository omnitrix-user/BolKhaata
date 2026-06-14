import { api } from '../api'
import { invoiceMessage, waLink } from './waMessage'

// Share an invoice on WhatsApp.
//
// If the invoice's customer has a stored phone number, open that contact's chat
// directly (wa.me/<number>) with a localised, pre-written message — the same
// proven pattern as the Khata reminder. (WhatsApp can't pre-attach media to a
// targeted chat, so the invoice image goes in as a tappable link.)
//
// If no phone is stored, fall back to the native share sheet with the actual JPG
// attached, and call onNoPhone() so the caller can show a toast.
export async function shareInvoice(inv, shop, lang = 'en', { onNoPhone } = {}) {
  const base = {
    shopName: shop?.name || 'BolKhaata',
    customerName: inv.customer_name,
    total: inv.total,
    items: inv.items,
    upiId: shop?.upi_id || '',
  }
  const imageUrl = api.invoiceImageUrl(inv.invoice_id)

  if (inv.phone) {
    window.open(waLink(inv.phone, invoiceMessage(lang, { ...base, imageUrl })), '_blank')
    return 'targeted'
  }

  // No phone on file -> generic share sheet with the real image attached.
  onNoPhone?.()
  let file = null
  try {
    const blob = await api.invoiceImageBlob(inv.invoice_id)
    file = new File([blob], `${inv.invoice_id}.jpg`, { type: 'image/jpeg' })
  } catch { /* fall through to link */ }

  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: invoiceMessage(lang, base), title: 'Invoice' })
      return 'image'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  window.open(waLink('', invoiceMessage(lang, { ...base, imageUrl })), '_blank')
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
