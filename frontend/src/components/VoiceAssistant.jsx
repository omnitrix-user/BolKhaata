import { useEffect, useState } from 'react'
import { api } from '../api'
import { t, SPEECH_LANG } from '../i18n'
import { formatRupee } from '../lib/format'
import { useSpeech } from '../lib/useSpeech'
import { matchCommand } from '../lib/commands'
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

  const route = async (text) => {
    const trimmed = (text || '').trim()
    if (!trimmed) return toast(tr('notUnderstood'), 'error')
    const cmd = matchCommand(trimmed)
    if (cmd?.type === 'nav') {
      nav.go(cmd.tab)
      toast(tr('opened'))
      return onClose()
    }
    setPhase('busy')
    try {
      const res = await api.parseIntent(trimmed)
      if (res.type === 'invoice' || res.type === 'khata') {
        setParsed(res)
        setPhase('action')
      } else {
        toast(tr('notUnderstood'), 'error')
        setPhase('review')
      }
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('review')
    }
  }

  const chooseInvoice = () => {
    const d = parsed.data || {}
    const prefillInv = parsed.type === 'invoice'
      ? { items: d.items, customer_name: d.customer_name }
      : { customer_name: d.customer_name }
    onClose()
    nav.openInvoiceCreate(prefillInv)
  }

  const chooseKhata = () => {
    const d = parsed.type === 'khata' ? parsed.data : {}
    setDraft({
      customer_name: d.customer_name || '',
      amount: d.amount || '',
      txn: d.txn || 'credit',
      note: d.note || '',
      phone: d.phone || null,
    })
    setPhase('khata')
  }

  const logWith = async ({ customer_id, customer_name }) => {
    setPhase('busy')
    try {
      const res = await api.logTransaction({
        customer_id,
        customer_name,
        amount: Number(draft.amount),
        type: draft.txn,
        note: draft.note || '',
        phone: draft.phone || null,
      })
      const verb = draft.txn === 'credit'
        ? (lang === 'en' ? 'credit logged' : lang === 'kn' ? 'ಸಾಲ ಸೇರಿಸಲಾಗಿದೆ' : 'उधार लिखा')
        : (lang === 'en' ? 'payment logged' : lang === 'kn' ? 'ಜಮಾ ಆಯಿತು' : 'जमा हुआ')
      toast(`${res.customer_name} — ${formatRupee(Number(draft.amount))} ${verb}`)
      onLogged?.()
      onClose()
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('khata')
    }
  }

  const submitKhata = async () => {
    if (!draft.customer_name.trim()) return toast(tr('unknownCustomer'), 'error')
    if (!draft.amount || Number(draft.amount) <= 0) return toast(tr('amount') + ' ' + tr('required'), 'error')
    setPhase('busy')
    try {
      const { matches } = await api.resolveCustomers(draft.customer_name.trim())
      if (matches.length > 1) { setCandidates(matches); setPhase('disambig') }
      else if (matches.length === 1) logWith({ customer_id: matches[0].id })
      else logWith({ customer_name: draft.customer_name.trim() }) // backend creates
    } catch {
      toast(tr('somethingWrong'), 'error')
      setPhase('khata')
    }
  }

  const pickNew = async () => {
    setPhase('busy')
    try {
      const r = await api.createCustomer(draft.customer_name.trim(), draft.phone || '')
      logWith({ customer_id: r.customer.id })
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
              {candidates.length} · {draft.customer_name}
            </p>
            <ul className="list">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button className="row" onClick={() => logWith({ customer_id: c.id })}>
                    <span className="row-main">
                      <span className="row-title">{c.name}</span>
                      <span className="row-sub dev">{c.phone || '—'}</span>
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
