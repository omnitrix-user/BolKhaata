// Localised WhatsApp message templates for the Khata (reminder) and Invoice
// share flows. Driven by the same `lang` the rest of the UI uses; falls back to
// English when a translation is missing. Switching language in settings is
// reflected on the next share (templates are read at call time).

const rupee = (n) => `₹${Math.round(Math.abs(Number(n) || 0))}`

export function reminderMessage(lang, { shopName = 'BolKhaata', customerName = '', amount = 0 }) {
  const name = customerName || ''
  const amt = rupee(amount)
  const T = {
    en: `Namaste ${name} 🙏\nYou have an outstanding balance of ${amt} at ${shopName}. Please pay at your convenience.\nThank you! 🙏`,
    hi: `नमस्ते ${name} 🙏\n${shopName} पर आपका ${amt} का उधार बाकी है। कृपया सुविधानुसार चुका दें।\nधन्यवाद! 🙏`,
    kn: `ನಮಸ್ಕಾರ ${name} 🙏\n${shopName} ನಲ್ಲಿ ನಿಮ್ಮ ${amt} ಸಾಲ ಬಾಕಿ ಇದೆ. ದಯವಿಟ್ಟು ಅನುಕೂಲವಾದಾಗ ಪಾವತಿಸಿ.\nಧನ್ಯವಾದ! 🙏`,
  }
  return T[lang] || T.en
}

export function invoiceMessage(lang, { shopName = 'BolKhaata', customerName = '', total = 0, items = [], upiId = '', imageUrl = '' }) {
  const name = customerName || ''
  const amt = rupee(total)
  const L = {
    en: { ready: 'Your invoice is ready:', total: `💰 Total: ${amt}`, upi: (u) => `💳 UPI: ${u} (scan the QR on the bill)`, thanks: 'Thank you! 🙏' },
    hi: { ready: 'आपका बिल तैयार है:', total: `💰 कुल: ${amt}`, upi: (u) => `💳 UPI: ${u} (बिल पर QR स्कैन करें)`, thanks: 'धन्यवाद! 🙏' },
    kn: { ready: 'ನಿಮ್ಮ ಬಿಲ್ ಸಿದ್ಧವಾಗಿದೆ:', total: `💰 ಒಟ್ಟು: ${amt}`, upi: (u) => `💳 UPI: ${u} (ಬಿಲ್‌ನಲ್ಲಿ QR ಸ್ಕ್ಯಾನ್ ಮಾಡಿ)`, thanks: 'ಧನ್ಯವಾದ! 🙏' },
  }
  const hello = { en: `Namaste ${name} 🙏`, hi: `नमस्ते ${name} 🙏`, kn: `ನಮಸ್ಕಾರ ${name} 🙏` }
  const tt = L[lang] || L.en
  const itemLines = (items || []).slice(0, 8).map((it) => {
    const qty = it.qty ? `${it.qty} x ` : ''
    return `• ${it.name} — ${qty}₹${Number(it.rate || 0).toFixed(0)}`
  })
  const lines = [`🧾 ${shopName}`, hello[lang] || hello.en, '', tt.ready]
  if (itemLines.length) lines.push(itemLines.join('\n'))
  lines.push('', tt.total)
  if (upiId) lines.push(tt.upi(upiId))
  lines.push('', tt.thanks)
  if (imageUrl) lines.push('', imageUrl)
  return lines.join('\n')
}

// Normalise an Indian number to wa.me form (digits, country code, no '+').
export function cleanPhone(phone) {
  if (!phone) return ''
  let d = String(phone).replace(/\D/g, '')
  if (d.length === 10) d = '91' + d
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1)
  return d
}

// wa.me deep link. With a number -> opens that contact's chat (Khata pattern);
// without -> opens the chooser.
export function waLink(phone, message) {
  const d = cleanPhone(phone)
  const base = d ? `https://wa.me/${d}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(message)}`
}
