// Lightweight, multilingual navigation/search command matcher (runs before the
// LLM). Returns { type:'nav', tab } for "show invoices / open khata" style
// commands, else null so the transcript falls through to transaction parsing.
const NAV_VERB = /(show|see|view|open|list|find|search|go to|dikha|dekho?|khol|kholo|batao|nikalo|दिखा|देख|खोल|बता|निकाल|ತೋರಿಸು|ತೆರೆ|ನೋಡು)/

export function matchCommand(text) {
  const t = (text || '').toLowerCase()
  if (!NAV_VERB.test(t)) return null
  if (/(invoice|bill|बिल|इनवॉइस|ಬಿಲ್)/.test(t)) return { type: 'nav', tab: 'invoices' }
  if (/(khata|khaata|ledger|udhaar|udhar|खाता|उधार|ಖಾತೆ|ಸಾಲ)/.test(t)) return { type: 'nav', tab: 'ledger' }
  if (/(setting|profile|सेटिंग|ಸೆಟ್ಟಿಂಗ್)/.test(t)) return { type: 'nav', tab: 'settings' }
  if (/(home|होम|मुख|ಮುಖ)/.test(t)) return { type: 'nav', tab: 'home' }
  return null
}
