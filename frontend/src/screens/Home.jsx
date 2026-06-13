import { useCallback, useEffect, useState } from 'react'
import { api, auth } from '../api'
import { t } from '../i18n'
import { formatRupee } from '../lib/format'
import { Mic } from '../components/Icons'

export default function Home({ lang, nav }) {
  const tr = (k) => t(lang, k)
  const shop = auth.shop || {}
  const [summary, setSummary] = useState(null)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')

  const loadSummary = useCallback(async () => {
    try { setSummary(await api.summary()) } catch { /* ignore */ }
  }, [])
  useEffect(() => { loadSummary() }, [loadSummary])

  const submitTyped = (e) => {
    e.preventDefault()
    if (!typed.trim()) return
    nav.openVoice(typed.trim())
    setTyped('')
    setTyping(false)
  }

  return (
    <div className="screen home">
      <header className="topbar">
        <div>
          <p className="topbar-greet dev">{greeting(lang)}</p>
          <h2 className="topbar-shop">{shop.name}</h2>
        </div>
      </header>

      {summary && (
        <section className="summary">
          <button className="sum-hero" onClick={() => nav.go('ledger')}>
            <span className="sum-hero-label dev">{tr('totalReceivable')}</span>
            <span className="sum-hero-val num">{formatRupee(summary.total_receivable)}</span>
            <span className="sum-hero-sub dev">{summary.due_count} {tr('dueCustomers')}</span>
          </button>
          <div className="sum-row">
            <div className="sum-chip sum-chip--red">
              <span className="dev">{tr('todayCredit')}</span>
              <b className="num">{formatRupee(summary.today_credit)}</b>
            </div>
            <div className="sum-chip sum-chip--green">
              <span className="dev">{tr('todayPayment')}</span>
              <b className="num">{formatRupee(summary.today_payment)}</b>
            </div>
          </div>
        </section>
      )}

      <section className="voice">
        <div className="mic-area">
          <p className="mic-status dev">{tr('tapToSpeak')}</p>
          <button className="mic-btn" onClick={() => nav.openVoice()} aria-label="record">
            <Mic />
          </button>
          <p className="mic-hint dev">{tr('micHint')}</p>

          <button className="link-btn dev" onClick={() => setTyping((v) => !v)}>
            ⌨︎ {tr('typeInstead')}
          </button>

          {typing && (
            <form className="type-box" onSubmit={submitTyped}>
              <input className="field-input" placeholder={tr('micHint')} value={typed}
                onChange={(e) => setTyped(e.target.value)} autoFocus />
              <button className="btn btn--primary" type="submit">→</button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

function greeting(lang) {
  const h = new Date().getHours()
  if (lang === 'hi') return h < 12 ? 'सुप्रभात 🌅' : h < 17 ? 'नमस्ते 🙏' : 'शुभ संध्या 🌙'
  if (lang === 'kn') return h < 12 ? 'ಶುಭೋದಯ 🌅' : h < 17 ? 'ನಮಸ್ಕಾರ 🙏' : 'ಶುಭ ಸಂಜೆ 🌙'
  return h < 12 ? 'Good morning' : h < 17 ? 'Namaste' : 'Good evening'
}
