import { useCallback, useEffect, useState } from 'react'
import { api, auth } from '../api'
import { t } from '../i18n'
import { formatRupee, timeAgo } from '../lib/format'
import { Plus, Receipt, WhatsApp, Download } from '../components/Icons'
import { shareInvoice } from '../lib/share'
import InvoicePreview from '../components/InvoicePreview'

export default function Invoices({ lang, nav }) {
  const tr = (k) => t(lang, k)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)

  const load = useCallback(() => {
    api.invoices()
      .then((d) => setInvoices(d.invoices || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="screen">
      <header className="topbar">
        <h2 className="topbar-shop dev">{tr('invoices')}</h2>
      </header>

      <button className="big-cta" onClick={() => nav.openInvoiceCreate()}>
        <Plus /> {tr('newInvoice')}
      </button>

      {loading && <p className="muted dev" style={{ textAlign: 'center' }}>{tr('loading')}</p>}
      {!loading && invoices.length === 0 && (
        <p className="empty dev"><Receipt style={{ fontSize: 40, opacity: 0.4 }} /><br />{tr('noInvoices')}</p>
      )}

      <ul className="list">
        {invoices.map((inv) => (
          <li key={inv.invoice_id} className="card inv-card">
            <div className="inv-top">
              <div>
                <span className="inv-id">{inv.invoice_id}</span>
                <span className="row-title">{inv.customer_name}</span>
                <span className="row-sub dev">{inv.items.length} {tr('item')} · {timeAgo(inv.date, lang)}</span>
              </div>
              <b className="num inv-total">{formatRupee(inv.total)}</b>
            </div>
            <div className="inv-actions">
              <button className="pill pill--wa" onClick={() => shareInvoice(inv, auth.shop)}>
                <WhatsApp /> {tr('shareWhatsApp')}
              </button>
              <button className="pill" onClick={() => setPreview(inv)}>
                <Download /> {tr('viewPdf')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {preview && <InvoicePreview lang={lang} inv={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
