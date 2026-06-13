import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { balanceMeta, formatRupee, timeAgo } from '../lib/format'
import { Back, Phone, Plus, Trash, WhatsApp } from '../components/Icons'
import { useToast } from '../components/Toast'

export default function CustomerDetail({ lang, customerId, nav }) {
  const tr = (k) => t(lang, k)
  const toast = useToast()
  const [data, setData] = useState(null)
  const [adding, setAdding] = useState(null) // 'credit' | 'payment' | null
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try { setData(await api.customer(customerId)) }
    catch { setData({ id: customerId, name: '', transactions: [], balance: 0, phone: '' }) }
  }, [customerId])

  useEffect(() => { load() }, [load])

  const addEntry = async (type) => {
    const amount = parseFloat(amt)
    if (!amount || amount <= 0) return toast(tr('amount') + ' ' + tr('required'), 'error')
    try {
      await api.logTransaction({ customer_id: customerId, amount, type, note })
      setAdding(null); setAmt(''); setNote('')
      toast(lang === 'hi' ? 'हो गया' : 'Done')
      load()
    } catch { toast(tr('somethingWrong'), 'error') }
  }

  const settle = async () => {
    if (!data || data.balance >= 0) return
    try {
      await api.logTransaction({ customer_id: customerId, amount: Math.abs(data.balance), type: 'payment', note: 'Settled' })
      toast(lang === 'hi' ? 'पूरा चुकता हो गया ✅' : 'Settled ✅')
      load()
    } catch { toast(tr('somethingWrong'), 'error') }
  }

  const remind = async () => {
    try {
      const res = await api.sendReminder({ customer_name: data.name, amount: data.balance, phone: data.phone })
      window.open(res.wa_link, '_blank')
    } catch { toast(tr('somethingWrong'), 'error') }
  }

  const addPhone = async () => {
    const p = prompt(tr('addPhone'))
    if (!p) return
    try { await api.setPhone(customerId, p.replace(/\D/g, '')); toast(lang === 'hi' ? 'नंबर सेव हुआ' : 'Phone saved'); load() }
    catch { toast(tr('somethingWrong'), 'error') }
  }

  const del = async (id) => {
    try { await api.deleteTransaction(id); load() } catch { toast(tr('somethingWrong'), 'error') }
  }

  if (!data) return <div className="screen"><p className="muted dev">{tr('loading')}</p></div>
  const m = balanceMeta(data.balance)

  return (
    <div className="screen overlay">
      <header className="topbar topbar--detail">
        <button className="icon-btn" onClick={nav.close} aria-label="back"><Back /></button>
        <h2 className="topbar-shop">{data.name}{data.phone ? ` · ${data.phone}` : ''}</h2>
        <span style={{ width: 40 }} />
      </header>

      <div className="cust-balance card" style={{ borderColor: m.color }}>
        <span className="dev" style={{ color: 'var(--text-muted)' }}>
          {m.state === 'due' ? tr('owes') : m.state === 'advance' ? tr('advance') : tr('settled')}
        </span>
        <b className="num cust-balance-val" style={{ color: m.color }}>{formatRupee(data.balance)}</b>
      </div>

      <div className="cust-actions">
        <button className="pill" onClick={() => setAdding('credit')}><Plus /> {tr('credit')}</button>
        <button className="pill" onClick={() => setAdding('payment')}><Plus /> {tr('payment')}</button>
        {data.balance < 0 && <button className="pill pill--green" onClick={settle}>{tr('settleUp')}</button>}
        {data.phone
          ? <button className="pill" onClick={() => window.open(`tel:${data.phone}`)}><Phone /> {tr('callCustomer')}</button>
          : <button className="pill" onClick={addPhone}><Phone /> {tr('addPhone')}</button>}
        {data.balance < 0 && <button className="pill pill--wa" onClick={remind}><WhatsApp /> WhatsApp</button>}
      </div>

      {adding && (
        <div className="card inline-add" style={{ animation: 'fadeUp .2s ease' }}>
          <p className="dev" style={{ margin: '0 0 8px', fontWeight: 600 }}>
            {adding === 'credit' ? tr('credit') : tr('payment')}
          </p>
          <div className="inline-row">
            <input className="field-input num" type="number" inputMode="decimal" placeholder="₹0" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus />
            <input className="field-input" placeholder={tr('note')} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="confirm-actions">
            <button className="btn btn--ghost" onClick={() => { setAdding(null); setAmt(''); setNote('') }}>{tr('cancel')}</button>
            <button className="btn btn--primary" onClick={() => addEntry(adding)}>{tr('save')}</button>
          </div>
        </div>
      )}

      <h3 className="section-h dev">{tr('history')}</h3>
      <ul className="list">
        {data.transactions.map((tx) => (
          <li key={tx.id}>
            <div className="row row--txn">
              <span className={`tx-dot ${tx.type === 'credit' ? 'tx-dot--red' : 'tx-dot--green'}`} />
              <span className="row-main">
                <span className="row-title dev">{tx.type === 'credit' ? tr('credit') : tr('payment')}{tx.note ? ` · ${tx.note}` : ''}</span>
                <span className="row-sub dev">{timeAgo(tx.date, lang)}</span>
              </span>
              <b className="num" style={{ color: tx.type === 'credit' ? 'var(--red)' : 'var(--green)' }}>
                {tx.type === 'credit' ? '−' : '+'}{formatRupee(tx.amount)}
              </b>
              <button className="icon-btn icon-btn--sm" onClick={() => del(tx.id)} aria-label="delete"><Trash /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
