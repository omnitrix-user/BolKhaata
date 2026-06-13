import { useState } from 'react'
import { api, auth } from '../api'
import { t } from '../i18n'
import { Back, Download, WhatsApp } from './Icons'
import { shareInvoice, downloadInvoiceJpg } from '../lib/share'
import { useToast } from './Toast'

// Full-screen invoice image preview with JPG download + WhatsApp share.
export default function InvoicePreview({ lang, inv, onClose }) {
  const tr = (k) => t(lang, k)
  const toast = useToast()
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="screen overlay preview-overlay" style={{ zIndex: 50 }}>
      <header className="topbar topbar--detail">
        <button className="icon-btn" onClick={onClose} aria-label="back"><Back /></button>
        <h2 className="topbar-shop dev">{tr('invoicePreview')}</h2>
        <span style={{ width: 40 }} />
      </header>

      <div className="preview-frame">
        {!loaded && <p className="muted dev" style={{ textAlign: 'center' }}>{tr('loading')}</p>}
        <img
          className="preview-img"
          src={api.invoiceImageUrl(inv.invoice_id)}
          alt={`Invoice ${inv.invoice_id}`}
          onLoad={() => setLoaded(true)}
          style={{ display: loaded ? 'block' : 'none' }}
        />
      </div>

      <div className="preview-actions">
        <button className="btn btn--wa" onClick={() => shareInvoice(inv, auth.shop)}>
          <WhatsApp /> {tr('shareWhatsApp')}
        </button>
        <button
          className="btn btn--primary btn--block"
          onClick={() => { downloadInvoiceJpg(inv); toast(tr('downloadJpg')) }}
        >
          <Download /> {tr('downloadJpg')}
        </button>
      </div>
    </div>
  )
}
