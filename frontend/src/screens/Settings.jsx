import { useState } from 'react'
import { api } from '../api'
import { t, LANGS, LANG_LABEL } from '../i18n'
import { Logo } from '../components/Icons'
import { useToast } from '../components/Toast'

export default function Settings({ lang, setLang, shop, setShop, onLogout }) {
  const tr = (k) => t(lang, k)
  const toast = useToast()
  const [edit, setEdit] = useState(false)
  const isStreet = shop.business_type === 'street_vendor'
  const [form, setForm] = useState({
    name: shop.name || '', owner_name: shop.owner_name || '',
    gstin: shop.gstin || '', address: shop.address || '',
    gst_rate: shop.gst_rate ?? 5, upi_id: shop.upi_id || '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    try {
      const payload = {
        name: form.name, owner_name: form.owner_name, address: form.address,
        upi_id: form.upi_id,
      }
      if (!isStreet) {
        payload.gstin = form.gstin
        payload.gst_rate = parseFloat(form.gst_rate) || 0
      }
      const res = await api.updateProfile(payload)
      const updated = { ...shop, ...res.shop }
      localStorage.setItem('bk_shop', JSON.stringify(updated))
      setShop(updated)
      setEdit(false)
      toast(lang === 'hi' ? 'सेव हो गया ✅' : 'Saved ✅')
    } catch { toast(tr('somethingWrong'), 'error') }
  }

  return (
    <div className="screen">
      <header className="topbar">
        <h2 className="topbar-shop dev">{tr('navSettings')}</h2>
      </header>

      <div className="card shop-head">
        <Logo size={48} />
        <div>
          <b>{shop.name}</b>
          <small className="muted">{shop.phone} · {shop.mode === 'multi' ? tr('multiShop') : tr('singleShop')}</small>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="section-h dev" style={{ margin: 0 }}>{tr('shopProfile')}</h3>
          {!edit && <button className="link-btn dev" onClick={() => setEdit(true)}>{tr('editProfile')}</button>}
        </div>

        {edit ? (
          <>
            <Field label={tr('shopName')} value={form.name} onChange={set('name')} />
            <Field label={tr('ownerName')} value={form.owner_name} onChange={set('owner_name')} />
            <Field label={tr('address')} value={form.address} onChange={set('address')} />
            <Field label={tr('upiId')} value={form.upi_id} onChange={set('upi_id')} placeholder="name@bank" />
            {!isStreet && <Field label={tr('gstin')} value={form.gstin} onChange={set('gstin')} />}
            {!isStreet && <Field label={tr('gstRate')} value={form.gst_rate} onChange={set('gst_rate')} type="number" inputMode="decimal" />}
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => setEdit(false)}>{tr('cancel')}</button>
              <button className="btn btn--primary" onClick={save}>{tr('saveChanges')}</button>
            </div>
          </>
        ) : (
          <dl className="kv">
            <Row k={tr('ownerName')} v={shop.owner_name || '—'} />
            <Row k={tr('address')} v={shop.address || '—'} />
            <Row k={tr('upiId')} v={shop.upi_id || '—'} />
            {isStreet
              ? <Row k="GST" v={tr('noGstShop')} />
              : <>
                  <Row k={tr('gstin')} v={shop.gstin || '—'} />
                  <Row k={tr('gstRate')} v={`${shop.gst_rate ?? 5}%`} />
                </>}
          </dl>
        )}
      </div>

      <div className="card">
        <h3 className="section-h dev" style={{ margin: '0 0 0.6rem' }}>{tr('language')}</h3>
        <div className="seg" style={{ margin: 0 }}>
          {LANGS.map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn--danger btn--block" onClick={onLogout}>{tr('logout')}</button>
      <p className="muted dev" style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}>
        बोलखाता · {tr('tagline')}
      </p>
    </div>
  )
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span className="field-label dev">{label}</span>
      <input className="field-input" {...props} />
    </label>
  )
}
function Row({ k, v }) {
  return (
    <div className="kv-row">
      <span className="dev muted">{k}</span>
      <span>{v}</span>
    </div>
  )
}
