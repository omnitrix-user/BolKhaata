import { useCallback, useEffect, useRef, useState } from 'react'
import { api, auth } from '../api'
import { t, SPEECH_LANG } from '../i18n'
import { formatRupee } from '../lib/format'
import { useSpeech } from '../lib/useSpeech'
import { Mic, WhatsApp, Check } from '../components/Icons'
import { useToast } from '../components/Toast'

export default function Home({ lang, nav }) {
  const tr = (k) => t(lang, k)
  const toast = useToast()
  const shop = auth.shop || {}

  const [phase, setPhase] = useState('idle') // idle|processing|confirm|success
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState(null) // {customer_name, amount, txn, note, phone}
  const [result, setResult] = useState(null) // {balance}
  const [summary, setSummary] = useState(null)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.summary())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  const handleError = useCallback((key) => {
    toast(tr(key), 'error')
    setPhase('idle')
    if (key === 'micUnsupported' || key === 'notUnderstood') setTyping(true)
  }, [toast, lang])

  const { supported, recording, interim, start, stop } = useSpeech({
    lang: SPEECH_LANG[lang] || 'hi-IN',
    onResult: (text) => { setTranscript(text); setPhase('review') },
    onError: handleError,
  })

  const parseText = async (text) => {
    setPhase('processing')
    try {
      const parsed = await api.parseIntent(text)
      if (parsed.type === 'khata') {
        setDraft({ ...parsed.data, amount: parsed.data.amount || '' })
        setPhase('confirm')
      } else if (parsed.type === 'invoice') {
        nav.openInvoiceCreate({ items: parsed.data.items, customer_name: parsed.data.customer_name })
        setPhase('idle')
      } else {
        toast(tr('notUnderstood'), 'error')
        setPhase('idle')
        setTyping(true)
      }
    } catch {
      handleError('somethingWrong')
    }
  }

  const toggleMic = () => {
    if (recording) { stop() }
    else if (phase === 'idle' || phase === 'success') {
      if (!supported) { setTyping(true); toast(tr('micUnsupported'), 'error'); return }
      setTranscript(''); start()
    }
  }

  const submitTyped = async (e) => {
    e.preventDefault()
    if (!typed.trim()) return
    setTranscript(typed)
    setTyping(false)
    await parseText(typed)
    setTyped('')
  }

  const save = async () => {
    if (!draft?.customer_name?.trim()) return toast(tr('unknownCustomer'), 'error')
    const amount = parseFloat(draft.amount)
    if (!amount || amount <= 0) return toast(tr('amount') + ' ' + tr('required'), 'error')
    setPhase('processing')
    try {
      const res = await api.logTransaction({
        customer_name: draft.customer_name.trim(),
        amount,
        type: draft.txn,
        note: draft.note || '',
        phone: draft.phone || null,
      })
      setResult({ balance: res.balance, draft: { ...draft, amount } })
      setPhase('success')
      loadSummary()
      const verb = draft.txn === 'credit' ? (lang === 'hi' ? 'उधार लिख दिया' : 'credit logged') : (lang === 'hi' ? 'जमा कर दिया' : 'payment logged')
      toast(`${draft.customer_name} — ${formatRupee(amount)} ${verb}`)
    } catch {
      handleError('somethingWrong')
    }
  }

  const reset = () => {
    setPhase('idle'); setDraft(null); setResult(null); setTranscript('')
  }

  const confirmReview = () => {
    if (transcript.trim()) parseText(transcript)
    else toast(tr('notUnderstood'), 'error')
  }
  const reRecord = () => {
    setTranscript(''); setDraft(null); setPhase('idle')
    if (supported) start()
  }

  const remind = async () => {
    const r = result.draft
    try {
      const res = await api.sendReminder({ customer_name: r.customer_name, amount: result.balance, phone: r.phone })
      window.open(res.wa_link, '_blank')
    } catch { toast(tr('somethingWrong'), 'error') }
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
        {phase === 'review' && (
          <div className="card confirm-card" style={{ animation: 'fadeUp .25s ease' }}>
            <p className="confirm-head dev">{tr('reviewHeading')}</p>
            <textarea
              className="field-input"
              rows={3}
              style={{ resize: 'none', lineHeight: 1.5 }}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              autoFocus
            />
            <p className="mic-hint dev" style={{ margin: '0.5rem 0 0.8rem' }}>{tr('reviewHint')}</p>
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={reRecord}>{tr('reRecord')}</button>
              <button className="btn btn--primary" onClick={confirmReview}>{tr('confirmText')}</button>
            </div>
          </div>
        )}

        {phase === 'confirm' && draft && (
          <ConfirmCard lang={lang} draft={draft} setDraft={setDraft} transcript={transcript} onSave={save} onCancel={reset} />
        )}

        {phase === 'success' && result && (
          <div className="card success-card" style={{ animation: 'fadeUp .3s ease' }}>
            <div className="success-tick"><Check /></div>
            <p className="success-title dev">{tr('saved')}</p>
            <p className="success-line dev">
              <b>{result.draft.customer_name}</b> — {tr('newBalance')}:{' '}
              <b className="num" style={{ color: result.balance < 0 ? 'var(--red)' : 'var(--green)' }}>
                {formatRupee(result.balance)} {result.balance < 0 ? tr('owes') : ''}
              </b>
            </p>
            <div className="success-actions">
              {result.balance < 0 && (
                <button className="btn btn--wa" onClick={remind}>
                  <WhatsApp /> {tr('remind')}
                </button>
              )}
              <button className="btn btn--primary btn--block" onClick={reset}>{tr('done')}</button>
            </div>
          </div>
        )}

        {(phase === 'idle' || phase === 'processing') && (
          <div className="mic-area">
            <p className="mic-status dev">
              {phase === 'processing' ? tr('processing') : recording ? tr('listening') : tr('tapToSpeak')}
            </p>

            <button
              type="button"
              className={`mic-btn ${recording ? 'mic-btn--rec' : ''} ${phase === 'processing' ? 'mic-btn--busy' : ''}`}
              onClick={toggleMic}
              disabled={phase === 'processing'}
              aria-label="record"
            >
              {recording && <Waveform />}
              {phase === 'processing' ? <span className="spinner" /> : <Mic />}
            </button>

            {recording && interim && <p className="transcript dev">“{interim}”</p>}

            <p className="mic-hint dev">{recording ? tr('tapToStop') : tr('micHint')}</p>

            {!recording && phase === 'idle' && (
              <button className="link-btn dev" onClick={() => setTyping((v) => !v)}>
                ⌨︎ {tr('typeInstead')}
              </button>
            )}

            {typing && !recording && (
              <form className="type-box" onSubmit={submitTyped}>
                <input
                  className="field-input"
                  placeholder={tr('micHint')}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                />
                <button className="btn btn--primary" type="submit">→</button>
              </form>
            )}

            {transcript && phase === 'idle' && (
              <p className="transcript dev">“{transcript}”</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function ConfirmCard({ lang, draft, setDraft, transcript, onSave, onCancel }) {
  const tr = (k) => t(lang, k)
  const upd = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  return (
    <div className="card confirm-card" style={{ animation: 'fadeUp .25s ease' }}>
      <p className="confirm-head dev">{tr('confirmEntry')}</p>

      <div className="seg seg--txn">
        <button className={draft.txn === 'credit' ? 'on on--red' : ''} onClick={() => setDraft((d) => ({ ...d, txn: 'credit' }))}>
          <span className="dev">{tr('credit')}</span>
        </button>
        <button className={draft.txn === 'payment' ? 'on on--green' : ''} onClick={() => setDraft((d) => ({ ...d, txn: 'payment' }))}>
          <span className="dev">{tr('payment')}</span>
        </button>
      </div>

      <label className="field">
        <span className="field-label dev">{tr('customer')}</span>
        <input className="field-input" value={draft.customer_name} onChange={upd('customer_name')} placeholder={tr('unknownCustomer')} />
      </label>
      <label className="field">
        <span className="field-label dev">{tr('amount')} (₹)</span>
        <input className="field-input num" type="number" inputMode="decimal" value={draft.amount} onChange={upd('amount')} placeholder="0" autoFocus={!draft.amount} />
      </label>
      <label className="field">
        <span className="field-label dev">{tr('note')}</span>
        <input className="field-input" value={draft.note} onChange={upd('note')} placeholder="—" />
      </label>

      {transcript && <p className="transcript dev">“{transcript}”</p>}

      <div className="confirm-actions">
        <button className="btn btn--ghost" onClick={onCancel}>{tr('cancel')}</button>
        <button className="btn btn--primary" onClick={onSave}>{tr('save')}</button>
      </div>
    </div>
  )
}

function Waveform() {
  return (
    <span className="wave" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  )
}

function greeting(lang) {
  const h = new Date().getHours()
  if (lang === 'hi') return h < 12 ? 'सुप्रभात 🌅' : h < 17 ? 'नमस्ते 🙏' : 'शुभ संध्या 🌙'
  if (lang === 'kn') return h < 12 ? 'ಶುಭೋದಯ 🌅' : h < 17 ? 'ನಮಸ್ಕಾರ 🙏' : 'ಶುಭ ಸಂಜೆ 🌙'
  return h < 12 ? 'Good morning' : h < 17 ? 'Namaste' : 'Good evening'
}
