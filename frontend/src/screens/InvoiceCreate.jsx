import { useMemo, useState } from 'react'
import { api, auth } from '../api'
import { t } from '../i18n'
import { formatRupee } from '../lib/format'
import { shareInvoice } from '../lib/share'
import { Back, Plus, Trash, WhatsApp, Download } from '../components/Icons'
import InvoicePreview from '../components/InvoicePreview'
import { useToast } from '../components/Toast'

const blankItem = (gst = 5) => ({ name: '', qty: 1, rate: '', gst })

export default function InvoiceCreate({ lang, prefill, nav }) {
  const tr = (k) => t(lang, k)
  const toast = useToast()
  const shop = auth.shop || {}
  const isStreet = shop.business_type === 'street_vendor'
  const defGst = isStreet ? 0 : (shop.gst_rate ?? 5)
  const [customer, setCustomer] = useState(prefill?.customer_name || '')
  const [items, setItems] = useState(
    prefill?.items?.length
      ? prefill.items.map((i) => ({ ...i, rate: i.rate || '', gst: isStreet ? 0 : (i.gst ?? defGst) }))
      : [blankItem(defGst)],
  )
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  const totals = useMemo(() => {
    let taxable = 0, gst = 0
    for (const it of items) {
      const q = parseFloat(it.qty) || 0
      const r = parseFloat(it.rate) || 0
      const tx = q * r
      taxable += tx
      gst += (tx * (parseFloat(it.gst) || 0)) / 100
    }
    return { taxable, gst, total: taxable + gst }
  }, [items])

  const upd = (idx, key) => (e) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, [key]: e.target.value } : it)))
  const addItem = () => setItems((a) => [...a, blankItem(defGst)])
  const removeItem = (idx) => setItems((a) => (a.length > 1 ? a.filter((_, i) => i !== idx) : a))

  const generate = async () => {
    if (!customer.trim()) return toast(tr('customer') + ' ' + tr('required'), 'error')
    const clean = items
      .map((it) => ({ name: it.name.trim(), qty: parseFloat(it.qty) || 0, rate: parseFloat(it.rate) || 0, gst: parseFloat(it.gst) || 0 }))
      .filter((it) => it.name && it.qty > 0 && it.rate > 0)
    if (!clean.length) return toast(tr('addItem'), 'error')
    setBusy(true)
    try {
      const r = await api.generateInvoice({
        customer_id: prefill?.customer_id, customer_name: customer.trim(), items: clean,
      })
      setCreated({ invoice_id: r.invoice_id, customer_name: customer.trim(), total: r.total, items: clean })
      nav.refresh?.()
      toast(lang === 'hi' ? 'बिल बन गया ✅' : 'Invoice created ✅')
    } catch {
      toast(tr('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="screen overlay">
        <header className="topbar topbar--detail">
          <button className="icon-btn" onClick={nav.close}><Back /></button>
          <h2 className="topbar-shop">{created.invoice_id}</h2>
          <span style={{ width: 40 }} />
        </header>
        <div className="card success-card" style={{ animation: 'fadeUp .3s ease' }}>
          <p className="success-title dev">{lang === 'hi' ? 'बिल तैयार है' : 'Invoice ready'}</p>
          <p className="success-line"><b>{created.customer_name}</b></p>
          <b className="num" style={{ fontSize: 32, color: 'var(--saffron)' }}>{formatRupee(created.total)}</b>
          <div className="success-actions">
            <button className="btn btn--wa" onClick={() => shareInvoice(created, auth.shop)}>
              <WhatsApp /> {tr('shareWhatsApp')}
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => setShowPreview(true)}>
              <Download /> {tr('viewPdf')}
            </button>
            <button className="btn btn--primary btn--block" onClick={() => nav.go('invoices')}>{tr('done')}</button>
          </div>
        </div>
        {showPreview && <InvoicePreview lang={lang} inv={created} onClose={() => setShowPreview(false)} />}
      </div>
    )
  }

  return (
    <div className="screen overlay">
      <header className="topbar topbar--detail">
        <button className="icon-btn" onClick={nav.close}><Back /></button>
        <h2 className="topbar-shop dev">{tr('newInvoice')}</h2>
        <span style={{ width: 40 }} />
      </header>

      <label className="field">
        <span className="field-label dev">{tr('customer')}</span>
        <input className="field-input" value={customer} onChange={(e) => setCustomer(e.target.value)} autoFocus />
      </label>

      <div className="inv-items">
        <div className="inv-items-head dev">
          <span style={{ flex: 2 }}>{tr('item')}</span>
          <span>{tr('qty')}</span>
          <span>{tr('rate')}</span>
          {!isStreet && <span>{tr('gst')}</span>}
          <span style={{ width: 28 }} />
        </div>
        {items.map((it, i) => (
          <div className="inv-item-row" key={i}>
            <input className="field-input" style={{ flex: 2 }} placeholder={tr('item')} value={it.name} onChange={upd(i, 'name')} />
            <input className="field-input num" type="number" inputMode="decimal" value={it.qty} onChange={upd(i, 'qty')} />
            <input className="field-input num" type="number" inputMode="decimal" placeholder="₹" value={it.rate} onChange={upd(i, 'rate')} />
            {!isStreet && <input className="field-input num" type="number" inputMode="decimal" value={it.gst} onChange={upd(i, 'gst')} />}
            <button className="icon-btn icon-btn--sm" onClick={() => removeItem(i)} aria-label="remove"><Trash /></button>
          </div>
        ))}
        <button className="link-btn dev" onClick={addItem}><Plus /> {tr('addItem')}</button>
      </div>

      <div className="card inv-summary">
        <div className="inv-sum-row">
          <span className="dev">{tr('total')}{!isStreet && ` (${lang === 'en' ? 'incl. GST' : 'GST'})`}</span>
          <b className="num">{formatRupee(totals.total)}</b>
        </div>
        {isStreet
          ? <small className="dev muted">{tr('noGstShop')}</small>
          : <small className="dev muted">+{formatRupee(totals.gst)} GST</small>}
      </div>

      <button className="btn btn--primary btn--block" onClick={generate} disabled={busy}>
        {busy ? '…' : tr('generate')}
      </button>
    </div>
  )
}
