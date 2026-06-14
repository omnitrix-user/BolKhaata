import { useEffect, useState } from 'react'
import { api } from '../api'
import { t, SPEECH_LANG } from '../i18n'
import { formatRupee } from '../lib/format'
import { useSpeech } from '../lib/useSpeech'
import { matchCommand, detectAction } from '../lib/commands'
import { Mic, Receipt, Book, X } from './Icons'
import { useToast } from './Toast'

// Global voice assistant: record -> review -> (navigate | action select ->
// khata w/ duplicate-name disambiguation | invoice). Opened from the nav mic on
// any page. `prefill` lets the typed box feed the same pipeline.
export default function VoiceAssistant({ lang, prefill, nav, onClose, onLogged }) {
  const tr = (k) => t(lang, k)
  const toast = useToast()
  const [phase, setPhase] = useState(prefill ? 'review' : 'record')
  const [transcript, setTranscript] = useState(prefill || '')
  const [parsed, setParsed] = useState(null)
  const [draft, setDraft] = useState(null)
  const [candidates, setCandidates] = useState([])
  // After disambiguation we run this with the chosen customer. Lets one
  // disambig screen serve "add to khata", "open khata" and "open invoice".
  const [pendingAction, setPendingAction] = useState(null)
  const [disambigName, setDisambigName] = useState('')

  const { supported, recording, interim, start, stop } = useSpeech({
    lang: SPEECH_LANG[lang] || 'hi-IN',
    onResult: (text) => { setTranscript(text); setPhase('review') },
    onError: (key) => {
      toast(tr(key), 'error')
      if (key === 'micUnsupported') setPhase('review') // let them type/edit
      else setPhase('record')
    },
  })

  // Auto-start recording when opened by voice (not when prefilled by typing).
  useEffect(() => {
    if (!prefill) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Customer resolution + action execution -------------------------------
  // EXACT-match only (api.resolveCustomers never returns partials). One match ->
  // run the action; many -> mandatory disambiguation; none -> create (for add /
  // new-khata) or report "not found" (for open commands). Never silently picks.
  const resolveAndRun = async (name, action, { createOnNone = false, notFoundKey = 'customerNotFound' } = {}) => {
    const clean = (name || '').trim()
    if (!clean) { toast(tr('unknownCustomer'), 'error'); setPhase('review'); return }
    setPhase('busy')
    try {
      const { matches } = await api.resolveCustomers(clean)
      if (matches.length === 1) return action(matches[0])
      if (matches.length > 1) {
        setCandidates(matches)
        setDisambigName(clean)
        setPendingAction(() => action) // store the fn itself
        setPhase('disambig')
        return
      }
      if (createOnNone) {
        const r = await api.createCustomer(clean, draft?.phone || '')
        return action({ id: r.customer.id, name: r.customer.name, phone: '', balance: 0 })
      }
      toast(`${clean} — ${tr(notFoundKey)}`, 'error')
      setPhase('review')
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('review')
    }
  }

  // Action executors — each receives a fully-resolved customer.
  const openKhataFor = (c) => { onClose(); nav.openCustomer(c.id) }

  const openLastInvoiceFor = async (c) => {
    setPhase('busy')
    try {
      const { invoices } = await api.customerInvoices(c.id)
      if (!invoices || invoices.length === 0) {
        toast(`${c.name} — ${tr('noInvoicesYet')}`, 'error')
        setPhase('review')
        return
      }
      onClose()
      nav.openInvoice(invoices[0]) // newest first
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('review')
    }
  }

  // "Open a new khata for X" — always a fresh ledger, even if X already exists.
  const createKhataAndOpen = async (name) => {
    const clean = (name || '').trim()
    if (!clean) { toast(tr('unknownCustomer'), 'error'); setPhase('review'); return }
    setPhase('busy')
    try {
      const r = await api.createCustomer(clean)
      toast(`${r.customer.name} — ${tr('khataOpened')}`)
      onLogged?.()
      onClose()
      nav.openCustomer(r.customer.id)
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('review')
    }
  }

  // --- Command routing: actions first, then transaction/invoice parsing -----
  const route = async (text) => {
    const trimmed = (text || '').trim()
    if (!trimmed) return toast(tr('notUnderstood'), 'error')

    const cmd = matchCommand(trimmed)
    if (cmd?.type === 'nav') { nav.go(cmd.tab); toast(tr('opened')); return onClose() }
    if (cmd?.type === 'createKhata') return createKhataAndOpen(cmd.name)
    if (cmd?.type === 'openKhata') return resolveAndRun(cmd.name, openKhataFor)
    if (cmd?.type === 'openInvoice') return resolveAndRun(cmd.name, openLastInvoiceFor)

    setPhase('busy')
    try {
      const res = await api.parseIntent(trimmed)
      if (res.type !== 'invoice' && res.type !== 'khata') {
        toast(tr('notUnderstood'), 'error')
        setPhase('review')
        return
      }
      setParsed(res)
      // If the spoken text explicitly names the destination, skip the chooser
      // and go straight there. Only genuinely ambiguous input shows the prompt.
      const decision = detectAction(trimmed, res)
      if (decision === 'invoice') return chooseInvoice(res)
      if (decision === 'khata') return chooseKhata(res)
      setPhase('action')
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('review')
    }
  }

  const chooseInvoice = (p = parsed) => {
    const d = p?.data || {}
    // Forward any parsed line-items (and a spoken phone) regardless of the
    // classified type, so spoken items aren't lost when the user picks Invoice.
    onClose()
    nav.openInvoiceCreate({ customer_name: d.customer_name || '', items: d.items || [], phone: d.phone || null })
  }

  const chooseKhata = (p = parsed) => {
    const d = p?.type === 'khata' ? (p.data || {}) : {}
    const draftObj = {
      customer_name: d.customer_name || '',
      amount: d.amount || '',
      txn: d.txn || 'credit',
      note: d.note || '',
      phone: d.phone || null,
    }
    setDraft(draftObj)
    // Complete khata command -> log directly (with disambiguation if needed).
    // Incomplete (missing name/amount) -> fall back to the editable form.
    if (draftObj.customer_name.trim() && Number(draftObj.amount) > 0) submitKhata(draftObj)
    else setPhase('khata')
  }

  const logWith = async ({ customer_id, customer_name }, d = draft) => {
    setPhase('busy')
    try {
      const res = await api.logTransaction({
        customer_id,
        customer_name,
        amount: Number(d.amount),
        type: d.txn,
        note: d.note || '',
        phone: d.phone || null,
      })
      const verb = d.txn === 'credit'
        ? (lang === 'en' ? 'credit logged' : lang === 'kn' ? 'ಸಾಲ ಸೇರಿಸಲಾಗಿದೆ' : 'उधार लिखा')
        : (lang === 'en' ? 'payment logged' : lang === 'kn' ? 'ಜಮಾ ಆಯಿತು' : 'जमा हुआ')
      toast(`${res.customer_name} — ${formatRupee(Number(d.amount))} ${verb}`)
      onLogged?.()
      onClose()
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('khata')
    }
  }

  const submitKhata = (d = draft) => {
    if (!d.customer_name.trim()) return toast(tr('unknownCustomer'), 'error')
    if (!d.amount || Number(d.amount) <= 0) return toast(tr('amount') + ' ' + tr('required'), 'error')
    // Exact resolution: 1 -> log; many -> disambiguate; none -> create new khata.
    resolveAndRun(d.customer_name.trim(), (c) => logWith({ customer_id: c.id, customer_name: c.name }, d), { createOnNone: true })
  }

  // "New customer" on the disambiguation screen: force a brand-new duplicate
  // khata, then continue whatever action was pending (log / open).
  const pickNew = async () => {
    setPhase('busy')
    try {
      const name = (disambigName || draft?.customer_name || '').trim()
      const r = await api.createCustomer(name, draft?.phone || '')
      const c = { id: r.customer.id, name: r.customer.name, phone: '', balance: 0 }
      if (pendingAction) pendingAction(c)
      else logWith({ customer_id: c.id, customer_name: c.name })
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('disambig')
    }
  }

  const upd = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }))

  return (
    <div className="screen overlay voice-overlay" style={{ zIndex: 60 }}>
      <header className="topbar topbar--detail">
        <span style={{ width: 40 }} />
        <h2 className="topbar-shop dev">{tr('voiceTitle')}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="close"><X /></button>
      </header>

      <div className="voice-body">
        {phase === 'record' && (
          <div className="mic-area">
            <p className="mic-status dev">{recording ? tr('listening') : tr('tapToSpeak')}</p>
            <button
              className={`mic-btn ${recording ? 'mic-btn--rec' : ''}`}
              onClick={() => (recording ? stop() : start())}
              aria-label="record"
            >
              {recording && <span className="wave" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</span>}
              <Mic />
            </button>
            <p className="mic-hint dev">{recording ? tr('tapToStop') : tr('micHint')}</p>
            {interim && <p className="transcript dev">“{interim}”</p>}
            {!supported && <p className="mic-hint dev">{tr('micUnsupported')}</p>}
          </div>
        )}

        {phase === 'busy' && (
          <div className="mic-area"><span className="spinner" style={{ borderTopColor: 'var(--saffron)' }} /><p className="mic-status dev">{tr('processing')}</p></div>
        )}

        {phase === 'review' && (
          <div className="card confirm-card">
            <p className="confirm-head dev">{tr('reviewHeading')}</p>
            <textarea className="field-input" rows={3} style={{ resize: 'none', lineHeight: 1.5 }}
              value={transcript} onChange={(e) => setTranscript(e.target.value)} autoFocus />
            <p className="mic-hint dev" style={{ margin: '.5rem 0 .8rem' }}>{tr('reviewHint')}</p>
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => { setTranscript(''); setPhase('record'); if (supported) start() }}>{tr('reRecord')}</button>
              <button className="btn btn--primary" onClick={() => route(transcript)}>{tr('confirmText')}</button>
            </div>
          </div>
        )}

        {phase === 'action' && (
          <div className="card confirm-card">
            <p className="confirm-head dev">{tr('actionQuestion')}</p>
            <p className="transcript dev" style={{ marginBottom: '1rem' }}>“{transcript}”</p>
            <div className="action-grid">
              <button className="action-card" onClick={chooseInvoice}>
                <Receipt /><span className="dev">{tr('actionInvoice')}</span>
              </button>
              <button className="action-card" onClick={chooseKhata}>
                <Book /><span className="dev">{tr('actionKhata')}</span>
              </button>
            </div>
          </div>
        )}

        {phase === 'khata' && draft && (
          <div className="card confirm-card">
            <p className="confirm-head dev">{tr('actionKhata')}</p>
            <div className="seg seg--txn">
              <button className={draft.txn === 'credit' ? 'on on--red' : ''} onClick={() => setDraft((d) => ({ ...d, txn: 'credit' }))}><span className="dev">{tr('credit')}</span></button>
              <button className={draft.txn === 'payment' ? 'on on--green' : ''} onClick={() => setDraft((d) => ({ ...d, txn: 'payment' }))}><span className="dev">{tr('payment')}</span></button>
            </div>
            <label className="field"><span className="field-label dev">{tr('customer')}</span>
              <input className="field-input" value={draft.customer_name} onChange={upd('customer_name')} placeholder={tr('unknownCustomer')} /></label>
            <label className="field"><span className="field-label dev">{tr('amount')} (₹)</span>
              <input className="field-input num" type="number" inputMode="decimal" value={draft.amount} onChange={upd('amount')} placeholder="0" autoFocus={!draft.amount} /></label>
            <label className="field"><span className="field-label dev">{tr('note')}</span>
              <input className="field-input" value={draft.note} onChange={upd('note')} placeholder="—" /></label>
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => setPhase('action')}>{tr('back')}</button>
              <button className="btn btn--primary" onClick={submitKhata}>{tr('save')}</button>
            </div>
          </div>
        )}

        {phase === 'disambig' && (
          <div className="card confirm-card">
            <p className="confirm-head dev">{tr('whichCustomer')}</p>
            <p className="mic-hint dev" style={{ margin: '0 0 .8rem' }}>
              {candidates.length} × “{disambigName}” — {tr('whichCustomerHint')}
            </p>
            <ul className="list">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    className="row"
                    onClick={() => (pendingAction ? pendingAction(c) : logWith({ customer_id: c.id, customer_name: c.name }))}
                  >
                    <span className="row-main">
                      <span className="row-title">{c.name}</span>
                      <span className="row-sub dev">{c.phone || tr('noPhone')}</span>
                    </span>
                    <b className="num" style={{ color: c.balance < 0 ? 'var(--red)' : 'var(--green)' }}>{formatRupee(c.balance)}</b>
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn btn--ghost btn--block" style={{ marginTop: '.7rem' }} onClick={pickNew}>{tr('newCustomer')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
