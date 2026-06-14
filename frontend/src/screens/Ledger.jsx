import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { balanceMeta, formatRupee, timeAgo } from '../lib/format'
import { Search, Trash } from '../components/Icons'
import { useToast } from '../components/Toast'

export default function Ledger({ lang, nav }) {
  const tr = (k) => t(lang, k)
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    api.ledger()
      .then((d) => setCustomers(d.customers || []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false))
  }, [])

  const del = async (c) => {
    const msg = lang === 'hi' ? `क्या आप ${c.name} का खाता हटाना चाहते हैं? सभी लेन-देन हट जाएंगे।`
      : lang === 'kn' ? `${c.name} ಅವರ ಖಾತೆ ಅಳಿಸಲು ಬಯಸುವಿರಾ? ಎಲ್ಲಾ ವಹಿವಾಟುಗಳು ಅಳಿಸಲಾಗುತ್ತದೆ.`
        : `Delete ${c.name}'s account? All their transactions will be removed.`
    if (!window.confirm(msg)) return
    try {
      await api.deleteCustomer(c.id)
      setCustomers((list) => list.filter((x) => x.id !== c.id))
      toast(lang === 'hi' ? 'खाता हटाया गया' : lang === 'kn' ? 'ಖಾತೆ ಅಳಿಸಲಾಗಿದೆ' : 'Account deleted')
    } catch { toast(tr('somethingWrong'), 'error') }
  }

  const filtered = useMemo(
    () => customers.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
    [customers, q],
  )

  return (
    <div className="screen">
      <header className="topbar">
        <h2 className="topbar-shop dev">{tr('khataLedger')}</h2>
      </header>

      <div className="search">
        <Search />
        <input className="search-input" placeholder={tr('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading && <p className="muted dev" style={{ textAlign: 'center' }}>{tr('loading')}</p>}
      {!loading && filtered.length === 0 && (
        <p className="empty dev">{tr('noCustomers')}</p>
      )}

      <ul className="list">
        {filtered.map((c) => {
          const m = balanceMeta(c.balance)
          return (
            <li key={c.id} className="row-wrap">
              <button className="row" onClick={() => nav.openCustomer(c.id)}>
                <span className="avatar" style={{ background: m.color }}>{c.name[0]?.toUpperCase()}</span>
                <span className="row-main">
                  <span className="row-title">{c.name}</span>
                  <span className="row-sub dev">{c.phone ? `${c.phone} · ` : ''}{timeAgo(c.last_at, lang)}</span>
                </span>
                <span className="row-end">
                  <b className="num" style={{ color: m.color }}>{formatRupee(c.balance)}</b>
                  <small className="dev" style={{ color: m.color }}>
                    {m.state === 'due' ? tr('owes') : m.state === 'advance' ? tr('advance') : tr('settled')}
                  </small>
                </span>
              </button>
              <button className="row-del" onClick={() => del(c)} aria-label={tr('deleteTxn')}>
                <Trash />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
