import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { balanceMeta, formatRupee, timeAgo } from '../lib/format'
import { Search } from '../components/Icons'

export default function Ledger({ lang, nav }) {
  const tr = (k) => t(lang, k)
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    api.ledger()
      .then((d) => setCustomers(d.customers || []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false))
  }, [])

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
            <li key={c.name}>
              <button className="row" onClick={() => nav.openCustomer(c.name)}>
                <span className="avatar" style={{ background: m.color }}>{c.name[0]?.toUpperCase()}</span>
                <span className="row-main">
                  <span className="row-title">{c.name}</span>
                  <span className="row-sub dev">{timeAgo(c.last_at, lang)}</span>
                </span>
                <span className="row-end">
                  <b className="num" style={{ color: m.color }}>{formatRupee(c.balance)}</b>
                  <small className="dev" style={{ color: m.color }}>
                    {m.state === 'due' ? tr('owes') : m.state === 'advance' ? tr('advance') : tr('settled')}
                  </small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
