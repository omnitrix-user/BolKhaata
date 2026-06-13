export function formatRupee(amount, withSign = false) {
  const n = Math.abs(amount)
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n)
  if (withSign && amount < 0) return `-${formatted}`
  return formatted
}

// Balance sign convention (backend): negative => customer owes the shop.
export function balanceMeta(balance) {
  if (balance < 0) return { state: 'due', color: 'var(--red)' }
  if (balance > 0) return { state: 'advance', color: 'var(--green)' }
  return { state: 'settled', color: 'var(--text-muted)' }
}

const AGO = {
  hi: { now: 'अभी', min: 'मिनट पहले', hr: 'घंटे पहले', day: 'दिन पहले' },
  kn: { now: 'ಈಗ', min: 'ನಿಮಿಷಗಳ ಹಿಂದೆ', hr: 'ಗಂಟೆಗಳ ಹಿಂದೆ', day: 'ದಿನಗಳ ಹಿಂದೆ' },
  en: { now: 'just now', min: 'min ago', hr: 'hr ago', day: 'days ago' },
}

export function timeAgo(iso, lang = 'hi') {
  if (!iso) return ''
  const L = AGO[lang] || AGO.hi
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  const s = (Date.now() - then.getTime()) / 1000
  if (Number.isNaN(s)) return iso
  if (s < 60) return L.now
  if (s < 3600) return `${Math.floor(s / 60)} ${L.min}`
  if (s < 86400) return `${Math.floor(s / 3600)} ${L.hr}`
  const d = Math.floor(s / 86400)
  if (d < 30) return `${d} ${L.day}`
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
