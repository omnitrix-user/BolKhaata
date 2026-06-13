import { useState } from 'react'
import { api } from '../api'
import { t, nextLang } from '../i18n'
import { Logo, Book, Home as HomeIcon, Receipt } from '../components/Icons'
import { useToast } from '../components/Toast'

const LANG_PILL = { hi: 'हिं', kn: 'ಕನ್', en: 'EN' }

export default function Onboarding({ onAuthed, lang, setLang }) {
  const tr = (k) => t(lang, k)
  const toast = useToast()
  const [step, setStep] = useState('mode') // mode | auth
  const [mode, setMode] = useState('single')
  const [businessType, setBusinessType] = useState('standard')
  const [view, setView] = useState('register') // register | login
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({
    name: '', owner_name: '', phone: '', pin: '', gstin: '', address: '',
    gst_rate: '5', upi_id: '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const isStreet = businessType === 'street_vendor'

  const chooseProfile = (bt, m) => {
    setBusinessType(bt)
    setMode(m)
    setView(m === 'multi' ? 'login' : 'register')
    setStep('auth')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    const phone = form.phone.replace(/\D/g, '')
    if (phone.length !== 10) return toast(lang === 'hi' ? '10 अंकों का नंबर डालें' : 'Enter a 10-digit number', 'error')
    if (!/^\d{4,6}$/.test(form.pin)) return toast(lang === 'hi' ? 'PIN 4 अंकों का हो' : 'PIN must be 4 digits', 'error')

    setBusy(true)
    try {
      let res
      if (view === 'register') {
        if (!form.name.trim()) { setBusy(false); return toast(tr('shopName') + ' ' + tr('required'), 'error') }
        res = await api.register({
          name: form.name, owner_name: form.owner_name, phone, pin: form.pin,
          gstin: form.gstin, address: form.address, mode,
          business_type: businessType,
          gst_rate: isStreet ? 0 : parseFloat(form.gst_rate) || 5,
          upi_id: form.upi_id,
        })
        // auto-login to obtain a session token
        res = await api.login({ phone, pin: form.pin })
      } else {
        res = await api.login({ phone, pin: form.pin })
      }
      onAuthed(res.shop)
      toast(lang === 'hi' ? 'स्वागत है! 🎉' : 'Welcome! 🎉')
    } catch (err) {
      const msg =
        err.status === 409 ? (lang === 'hi' ? 'यह नंबर पहले से रजिस्टर्ड है' : 'Number already registered')
        : err.status === 401 ? (lang === 'hi' ? 'गलत नंबर या PIN' : 'Wrong number or PIN')
        : err.status === 0 ? (lang === 'hi' ? 'सर्वर से कनेक्ट नहीं हुआ' : "Can't reach server")
        : tr('somethingWrong')
      toast(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onb">
      <button
        className="lang-pill"
        onClick={() => setLang(nextLang(lang))}
        aria-label="language"
      >
        {LANG_PILL[nextLang(lang)]}
      </button>

      <div className="onb-hero">
        <Logo size={72} />
        <h1 className="onb-title dev">{tr('appName')}</h1>
        <p className="onb-tag dev">{tr('tagline')}</p>
      </div>

      {step === 'mode' && (
        <div className="onb-body" style={{ animation: 'fadeUp .3s ease' }}>
          <p className="onb-q dev">{tr('chooseMode')}</p>
          <button className="mode-card" onClick={() => chooseProfile('street_vendor', 'single')}>
            <span className="mode-ic"><Receipt /></span>
            <span>
              <strong className="dev">{tr('streetVendor')}</strong>
              <small className="dev">{tr('streetVendorDesc')}</small>
            </span>
          </button>
          <button className="mode-card" onClick={() => chooseProfile('standard', 'single')}>
            <span className="mode-ic"><HomeIcon /></span>
            <span>
              <strong className="dev">{tr('singleShop')}</strong>
              <small className="dev">{tr('singleShopDesc')}</small>
            </span>
          </button>
          <button className="mode-card" onClick={() => chooseProfile('standard', 'multi')}>
            <span className="mode-ic"><Book /></span>
            <span>
              <strong className="dev">{tr('multiShop')}</strong>
              <small className="dev">{tr('multiShopDesc')}</small>
            </span>
          </button>
        </div>
      )}

      {step === 'auth' && (
        <form className="onb-body" onSubmit={submit} style={{ animation: 'fadeUp .3s ease' }}>
          <div className="seg">
            <button type="button" className={view === 'login' ? 'on' : ''} onClick={() => setView('login')}>
              {tr('login')}
            </button>
            <button type="button" className={view === 'register' ? 'on' : ''} onClick={() => setView('register')}>
              {tr('register')}
            </button>
          </div>

          {view === 'register' && (
            <>
              <Field label={tr('shopName')} value={form.name} onChange={set('name')} autoFocus />
              <Field label={tr('ownerName')} value={form.owner_name} onChange={set('owner_name')} />
            </>
          )}
          <Field label={tr('phone')} value={form.phone} onChange={set('phone')} type="tel" inputMode="numeric" maxLength={10} />
          <Field label={tr('pin')} value={form.pin} onChange={set('pin')} type="password" inputMode="numeric" maxLength={6} />

          {view === 'register' && (
            <>
              <Field label={tr('address')} value={form.address} onChange={set('address')} />
              <Field label={tr('upiId')} value={form.upi_id} onChange={set('upi_id')} placeholder="name@bank" />
              {!isStreet && (
                <>
                  <Field label={tr('gstin')} value={form.gstin} onChange={set('gstin')} />
                  <Field label={tr('gstRate')} value={form.gst_rate} onChange={set('gst_rate')} type="number" inputMode="decimal" />
                </>
              )}
              {isStreet && <p className="muted dev" style={{ fontSize: 13, margin: '2px 4px' }}>✓ {tr('noGstShop')}</p>}
            </>
          )}

          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? '…' : view === 'register' ? tr('register') : tr('login')}
          </button>

          <button
            type="button"
            className="link-btn dev"
            onClick={() => setView(view === 'register' ? 'login' : 'register')}
          >
            {view === 'register' ? tr('haveAccount') : tr('needAccount')}
          </button>
          <button type="button" className="link-btn" onClick={() => setStep('mode')}>
            ← {tr('back')}
          </button>
        </form>
      )}
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
