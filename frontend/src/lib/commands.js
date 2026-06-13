// Voice command matcher. Turns a transcript into a structured ACTION (not just a
// page navigation) with the customer name entity extracted. Runs before the LLM;
// returns null when the transcript isn't a recognised command so it falls through
// to transaction (khata/invoice) parsing.
//
// Returned shapes:
//   { type:'createKhata', name }          open a brand-new khata (even if name exists)
//   { type:'openKhata',   name }           open a specific customer's ledger
//   { type:'openInvoice', name, which }    open a customer's last/most-recent invoice
//   { type:'search', target, q }           search customers or invoices
//   { type:'nav', tab }                    bare navigation (no entity)
//   null                                   not a command

// Word groups (Latin + Devanagari + Kannada). Devanagari/Kannada stems consume
// trailing vowel-signs via the script ranges so "खोलो"/"खाता" match fully.
const DV = '[\\u0900-\\u097F]*' // Devanagari continuation
const KN = '[\\u0C80-\\u0CFF]*' // Kannada continuation

const G = {
  verb: `(show|see|view|open|list|find|search|make|create|go ?to|dikha${DV}|dekh\\w*|khol\\w*|batao|nikalo|dhund\\w*|khoj\\w*|bana\\w*|दिखा${DV}|देख${DV}|खोल${DV}|बता${DV}|निकाल${DV}|ढूंढ${DV}|खोज${DV}|बना${DV}|ತೋರಿಸು|ತೆರೆ${KN}|ನೋಡು|ಹುಡುಕು|ರಚಿಸು)`,
  invoice: `(invoices?|bills?|receipts?|बिल${DV}|इनवॉ${DV}|इनवॉय${DV}|ರಸೀದಿ|ಬಿಲ್${KN})`,
  // "open khata" words only — deliberately excludes transaction words like
  // "udhaar"/"hisaab" so a credit phrase isn't mistaken for an open command.
  khata: `(khat\\w*|ledger|accounts?|खात${DV}|ಖಾತೆ${KN})`,
  settings: `(settings?|profile|सेटिंग${DV}|प्रोफ${DV}|ಸೆಟ್ಟಿಂಗ್${KN})`,
  home: `(home|dashboard|होम|मुख${DV}|ಮುಖಪುಟ${KN})`,
  neu: `(new|nay\\w*|नय${DV}|नई|ಹೊಸ${KN})`,
  last: `(last|latest|recent|aakhri|aakhiri|akhri|pichl\\w*|आख${DV}|पिछल${DV}|ताज़ा|ताजा|ಕೊನೆಯ${KN}|ಇತ್ತೀಚಿನ${KN})`,
}

const has = (key, t) => new RegExp(G[key], 'i').test(t)

// Tokens that are never part of a customer name.
const FILLERS = new Set([
  'of', 'for', 'the', 'a', 'an', 'to', 'please', 'pls', 'my', 'me', 'is',
  'ka', 'ki', 'ke', 'ko', 'kaa', 'kii', 'naam', 'se', 'wala', 'wale',
  'customer', 'grahak', 'naam', 'rupaye', 'rupees', 'rs',
  'का', 'के', 'की', 'को', 'नाम', 'से', 'वाला', 'वाले', 'ग्राहक', 'रुपये', 'रुपए',
  'ಗೆ', 'ಹೆಸರಿನಲ್ಲಿ', 'ಗ್ರಾಹಕ',
])

// Extract the customer-name entity: drop signal words (the given keys), fillers,
// numbers and punctuation; whatever Latin/Devanagari/Kannada words remain are the
// name. Returns null when nothing meaningful is left.
function extractName(raw, keys) {
  const anchored = keys.map((k) => new RegExp(`^${G[k]}$`, 'i'))
  const tokens = ` ${raw} `
    .replace(/['’]s\b/gi, ' ') // possessive: "Rahul's" -> "Rahul"
    .replace(/[^\p{L}\p{M}\s]/gu, ' ') // strip ₹, digits, punctuation
    .split(/\s+/)
    .filter(Boolean)
  const keep = tokens.filter((tok) => {
    const low = tok.toLowerCase()
    if (FILLERS.has(low) || FILLERS.has(tok)) return false
    return !anchored.some((re) => re.test(tok))
  })
  return keep.join(' ').trim() || null
}

export function matchCommand(text) {
  const raw = (text || '').trim()
  if (!raw) return null
  const t = raw.toLowerCase()

  // Any spoken amount means this is a ledger/invoice ENTRY, not an open/create
  // command — let the transaction parser handle it. (Open/create commands and
  // bare navigation never carry a rupee figure.)
  if (/\d/.test(t) || /\b(sau|hazaar|hajaar|rupaye|rupees|rupee)\b/.test(t)) return null

  const isInvoice = has('invoice', t)
  const isKhata = has('khata', t)
  const isNew = has('neu', t)
  const isLast = has('last', t)
  const isVerb = has('verb', t)

  // 1. Create a brand-new khata — highest priority. "naya khata kholo Rahul",
  //    "open new account for Rahul". Never merges with an existing Rahul.
  if (isKhata && isNew) {
    const name = extractName(raw, ['verb', 'khata', 'neu'])
    if (name) return { type: 'createKhata', name }
  }

  // 2. Open an invoice (the latest one for a named customer).
  if (isInvoice) {
    const name = extractName(raw, ['verb', 'invoice', 'last'])
    if (name) return { type: 'openInvoice', name, which: isLast ? 'last' : 'last' }
    if (isVerb) return { type: 'nav', tab: 'invoices' } // bare "show invoices"
    return null
  }

  // 3. Open a specific customer's khata.
  if (isKhata) {
    const name = extractName(raw, ['verb', 'khata'])
    if (name) return { type: 'openKhata', name }
    if (isVerb) return { type: 'nav', tab: 'ledger' } // bare "show khata"
    return null
  }

  // 4. Bare navigation for settings / home.
  if (isVerb && has('settings', t)) return { type: 'nav', tab: 'settings' }
  if (isVerb && has('home', t)) return { type: 'nav', tab: 'home' }

  return null
}
