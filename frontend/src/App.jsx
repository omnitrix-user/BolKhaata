import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const API = 'http://localhost:8000'

function formatRupee(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.71V21h2v-3.29A7 7 0 0 0 19 11h-2Z" />
    </svg>
  )
}

function VoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Zm0-2a5 5 0 0 0-5 5v6a5 5 0 0 0 10 0V6a5 5 0 0 0-5-5Z" />
      <path d="M5 11H3a9 9 0 0 0 8 8.94V23h2v-3.06A9 9 0 0 0 21 11h-2a7 7 0 0 1-14 0Z" />
    </svg>
  )
}

function LedgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v14h16V6H4Zm3 2h10v2H7V8Zm0 4h10v2H7v-2Zm0 4h7v2H7v-2Z" />
    </svg>
  )
}

function App() {
  const [tab, setTab] = useState('voice')
  const [phase, setPhase] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [intent, setIntent] = useState(null)
  const [error, setError] = useState('')
  const [balance, setBalance] = useState(null)
  const [customers, setCustomers] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const resetVoice = useCallback(() => {
    setPhase('idle')
    setTranscript('')
    setIntent(null)
    setError('')
    setBalance(null)
  }, [])

  const startRecording = useCallback(async () => {
    setError('')
    setTranscript('')
    setIntent(null)
    setBalance(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        if (blob.size === 0) {
          setPhase('idle')
          setError('No audio captured. Try again.')
          return
        }
        await processRecording(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setPhase('recording')
    } catch {
      setError('Microphone access denied.')
      setPhase('idle')
    }
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder?.state === 'recording') {
      setPhase('processing')
      recorder.stop()
    }
  }, [])

  const processRecording = async (blob) => {
    try {
      setPhase('processing')

      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      const transcribeRes = await fetch(`${API}/transcribe`, {
        method: 'POST',
        body: form,
      })
      if (!transcribeRes.ok) throw new Error('Transcription failed')
      const { transcript: text } = await transcribeRes.json()
      setTranscript(text)

      if (!text?.trim()) {
        setError('Could not understand. Please speak clearly and try again.')
        setPhase('idle')
        return
      }

      const intentRes = await fetch(`${API}/parse-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      })
      if (!intentRes.ok) throw new Error('Could not parse intent')
      const parsed = await intentRes.json()
      setIntent(parsed)

      if (parsed.type === 'khata') {
        setPhase('confirm')
      } else if (parsed.type === 'invoice') {
        setError('Invoice detected — invoice flow coming soon.')
        setPhase('idle')
      } else {
        setError('Could not understand the transaction. Try again.')
        setPhase('idle')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
      setPhase('idle')
    }
  }

  const confirmTransaction = async () => {
    if (!intent?.data) return
    const { customer_name, amount, txn, note, phone } = intent.data

    try {
      setPhase('processing')
      const res = await fetch(`${API}/log-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name,
          amount,
          type: txn,
          note: note || '',
          phone: phone || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save transaction')
      const result = await res.json()
      setBalance(result.balance)
      setPhase('success')
    } catch (err) {
      setError(err.message || 'Failed to save.')
      setPhase('confirm')
    }
  }

  const toggleMic = () => {
    if (phase === 'recording') stopRecording()
    else if (phase === 'idle' || phase === 'success') startRecording()
  }

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true)
    try {
      const res = await fetch(`${API}/ledger`)
      if (!res.ok) throw new Error('Failed to load ledger')
      const data = await res.json()
      setCustomers(data.customers || [])
    } catch {
      setCustomers([])
    } finally {
      setLedgerLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'ledger') loadLedger()
  }, [tab, loadLedger])

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const khata = intent?.type === 'khata' ? intent.data : null
  const isRecording = phase === 'recording'
  const isProcessing = phase === 'processing'
  const micDisabled = isProcessing || phase === 'confirm'

  return (
    <div className="app">
      <header className="header">
        <h1>BolKhaata</h1>
        <p className="tagline">Bol ke likho — voice khata</p>
      </header>

      <main className="main">
        {tab === 'voice' && (
          <section className="voice-screen">
            {phase === 'confirm' && khata && (
              <div className="confirm-card">
                <p className="confirm-label">Confirm entry</p>
                <div className={`txn-badge txn-badge--${khata.txn}`}>
                  {khata.txn === 'payment' ? 'Payment received' : 'Udhaar (credit)'}
                </div>
                <p className="confirm-customer">{khata.customer_name || 'Unknown customer'}</p>
                <p className="confirm-amount">{formatRupee(khata.amount)}</p>
                {khata.note && <p className="confirm-note">{khata.note}</p>}
                {transcript && (
                  <p className="confirm-transcript">&ldquo;{transcript}&rdquo;</p>
                )}
                <div className="confirm-actions">
                  <button type="button" className="btn btn--ghost" onClick={resetVoice}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn--primary" onClick={confirmTransaction}>
                    Save to khata
                  </button>
                </div>
              </div>
            )}

            {phase === 'success' && (
              <div className="success-card">
                <p className="success-title">Saved!</p>
                {balance !== null && (
                  <p className="success-balance">
                    New balance: <strong>{formatRupee(balance)}</strong>
                  </p>
                )}
                <button type="button" className="btn btn--primary" onClick={resetVoice}>
                  Done
                </button>
              </div>
            )}

            {!['confirm', 'success'].includes(phase) && (
              <div className="mic-area">
                <p className="status-text">
                  {isRecording && 'Listening… tap to stop'}
                  {isProcessing && 'Processing your voice…'}
                  {phase === 'idle' && !error && 'Tap the mic and speak your entry'}
                </p>

                {transcript && phase === 'idle' && (
                  <p className="last-transcript">&ldquo;{transcript}&rdquo;</p>
                )}

                <button
                  type="button"
                  className={`mic-btn ${isRecording ? 'mic-btn--recording' : ''} ${isProcessing ? 'mic-btn--processing' : ''}`}
                  onClick={toggleMic}
                  disabled={micDisabled}
                  aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                >
                  <MicIcon />
                  {isRecording && <span className="mic-pulse" aria-hidden="true" />}
                </button>

                <p className="mic-hint">
                  {isRecording ? 'Tap again to finish' : 'e.g. "Ramesh ko 200 rupaye udhaar"'}
                </p>
              </div>
            )}

            {error && !['confirm', 'success'].includes(phase) && (
              <p className="error-banner" role="alert">{error}</p>
            )}
          </section>
        )}

        {tab === 'ledger' && (
          <section className="ledger-screen">
            <h2>Khata ledger</h2>
            {ledgerLoading && <p className="status-text">Loading…</p>}
            {!ledgerLoading && customers.length === 0 && (
              <p className="empty-state">No customers yet. Record your first entry.</p>
            )}
            <ul className="customer-list">
              {customers.map((c) => (
                <li key={c.name} className="customer-row">
                  <span className="customer-name">{c.name}</span>
                  <span className={`customer-balance ${c.balance > 0 ? 'customer-balance--due' : ''}`}>
                    {formatRupee(c.balance)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <button
          type="button"
          className={`nav-item ${tab === 'voice' ? 'nav-item--active' : ''}`}
          onClick={() => setTab('voice')}
        >
          <VoiceIcon />
          <span>Voice</span>
        </button>
        <button
          type="button"
          className={`nav-item ${tab === 'ledger' ? 'nav-item--active' : ''}`}
          onClick={() => setTab('ledger')}
        >
          <LedgerIcon />
          <span>Khata</span>
        </button>
      </nav>
    </div>
  )
}

export default App
