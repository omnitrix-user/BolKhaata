import { useCallback, useEffect, useState } from 'react'
import './App.css'

import { api, auth } from './api'
import { t } from './i18n'
import { Book, Gear, Home as HomeIcon, Receipt, Mic } from './components/Icons'
import { ToastProvider } from './components/Toast'
import VoiceAssistant from './components/VoiceAssistant'
import Onboarding from './screens/Onboarding'
import HomeScreen from './screens/Home'
import Ledger from './screens/Ledger'
import CustomerDetail from './screens/CustomerDetail'
import Invoices from './screens/Invoices'
import InvoiceCreate from './screens/InvoiceCreate'
import Settings from './screens/Settings'

function App() {
  const [lang, setLangState] = useState(localStorage.getItem('bk_lang') || 'hi')
  const [shop, setShop] = useState(auth.shop)
  const [tab, setTab] = useState('home')
  const [overlay, setOverlay] = useState(null)
  const [voice, setVoice] = useState(null) // { prefill } | null
  const [refreshNonce, setRefreshNonce] = useState(0)

  const setLang = useCallback((l) => {
    localStorage.setItem('bk_lang', l)
    setLangState(l)
  }, [])

  useEffect(() => {
    const onLogout = () => setShop(null)
    window.addEventListener('bk:logout', onLogout)
    return () => window.removeEventListener('bk:logout', onLogout)
  }, [])

  const handleAuthed = useCallback((s) => {
    auth.save(s)
    setShop(s)
    setTab('home')
  }, [])

  const logout = useCallback(() => {
    auth.clear()
    setShop(null)
    setOverlay(null)
  }, [])

  const nav = {
    openCustomer: (id) => setOverlay({ type: 'customer', id }),
    openInvoiceCreate: (prefill) => setOverlay({ type: 'invoiceCreate', prefill }),
    openVoice: (prefill = '') => setVoice({ prefill }),
    refresh: () => setRefreshNonce((n) => n + 1),
    close: () => setOverlay(null),
    go: (newTab) => {
      setOverlay(null)
      setTab(newTab)
    },
  }

  const tr = (key) => t(lang, key)

  if (!shop) {
    return (
      <ToastProvider>
        <Onboarding onAuthed={handleAuthed} lang={lang} setLang={setLang} />
      </ToastProvider>
    )
  }

  const navItems = [
    { id: 'home', icon: HomeIcon, label: tr('navHome') },
    { id: 'ledger', icon: Book, label: tr('navKhata') },
    { id: 'invoices', icon: Receipt, label: tr('navBill') },
    { id: 'settings', icon: Gear, label: tr('navSettings') },
  ]

  return (
    <ToastProvider>
      <div className="app">
        <main className="main">
          {tab === 'home' && <HomeScreen key={`home-${refreshNonce}`} lang={lang} nav={nav} />}
          {tab === 'ledger' && <Ledger key={`ledger-${refreshNonce}`} lang={lang} nav={nav} />}
          {tab === 'invoices' && <Invoices key={`inv-${refreshNonce}`} lang={lang} nav={nav} />}
          {tab === 'settings' && (
            <Settings lang={lang} setLang={setLang} shop={shop} setShop={setShop} onLogout={logout} />
          )}

          {overlay?.type === 'customer' && (
            <CustomerDetail lang={lang} customerId={overlay.id} nav={nav} />
          )}
          {overlay?.type === 'invoiceCreate' && (
            <InvoiceCreate lang={lang} prefill={overlay.prefill} nav={nav} />
          )}
        </main>

        <nav className="bottom-nav bottom-nav--fab" aria-label="Main">
          {navItems.slice(0, 2).map((item) => (
            <NavBtn key={item.id} item={item} tab={tab} overlay={overlay} nav={nav} />
          ))}
          <button type="button" className="nav-mic" onClick={() => nav.openVoice()} aria-label="voice">
            <Mic />
          </button>
          {navItems.slice(2).map((item) => (
            <NavBtn key={item.id} item={item} tab={tab} overlay={overlay} nav={nav} />
          ))}
        </nav>

        {voice && (
          <VoiceAssistant
            lang={lang}
            prefill={voice.prefill}
            nav={nav}
            onClose={() => setVoice(null)}
            onLogged={() => { setVoice(null); nav.refresh() }}
          />
        )}
      </div>
    </ToastProvider>
  )
}

function NavBtn({ item, tab, overlay, nav }) {
  const Icon = item.icon
  const active = tab === item.id && !overlay
  return (
    <button
      type="button"
      className={`nav-item ${active ? 'nav-item--active' : ''}`}
      onClick={() => nav.go(item.id)}
    >
      <Icon />
      <span>{item.label}</span>
    </button>
  )
}

export default App
