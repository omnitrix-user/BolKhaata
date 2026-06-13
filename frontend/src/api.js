// API client for BolKhaata. Token is kept in localStorage; the base URL points
// at the FastAPI server on port 8000 (same host the app is served from, so it
// also works when the PWA is opened from a phone on the same wifi).

const BASE =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`

const TOKEN_KEY = 'bk_token'
const SHOP_KEY = 'bk_shop'

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY) || ''
  },
  get shop() {
    try {
      return JSON.parse(localStorage.getItem(SHOP_KEY) || 'null')
    } catch {
      return null
    }
  },
  save(shop) {
    localStorage.setItem(TOKEN_KEY, shop.token)
    localStorage.setItem(SHOP_KEY, JSON.stringify(shop))
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(SHOP_KEY)
  },
}

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } }
  if (auth.token) opts.headers['X-Shop-Token'] = auth.token
  if (body instanceof FormData) {
    opts.body = body
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, opts)
  } catch {
    throw new ApiError('network', 0)
  }

  if (res.status === 401) {
    auth.clear()
    window.dispatchEvent(new Event('bk:logout'))
    throw new ApiError('unauthorized', 401)
  }

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null
  if (!res.ok) {
    throw new ApiError(data?.detail || 'error', res.status)
  }
  return data
}

export const api = {
  base: BASE,
  health: () => request('/health'),

  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),

  parseIntent: (transcript) =>
    request('/parse-intent', { method: 'POST', body: { transcript } }),

  async transcribe(blob) {
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')
    return request('/transcribe', { method: 'POST', body: form })
  },

  logTransaction: (entry) => request('/log-transaction', { method: 'POST', body: entry }),
  ledger: () => request('/ledger'),
  customer: (id) => request(`/customer/${id}`),
  customerInvoices: (id) => request(`/customer/${id}/invoices`),
  // EXACT-match candidates (for disambiguation). Never returns partial matches.
  resolveCustomers: (name) => request('/customers/resolve', { method: 'POST', body: { name } }),
  // Fuzzy contains-search (for the search UI/command only).
  searchCustomers: (name) => request('/customers/search', { method: 'POST', body: { name } }),
  createCustomer: (name, phone = '') =>
    request('/customers', { method: 'POST', body: { name, phone } }),
  deleteTransaction: (id) => request(`/transaction/${id}`, { method: 'DELETE' }),
  setPhone: (id, phone) =>
    request(`/customer/${id}/phone`, { method: 'POST', body: { phone } }),
  summary: () => request('/summary'),

  invoices: () => request('/invoices'),
  deleteInvoice: (invoiceId) => request(`/invoice/${invoiceId}`, { method: 'DELETE' }),
  sendReminder: (payload) => request('/send-reminder', { method: 'POST', body: payload }),

  // Returns { invoice_id, total, image_url, pdf_url }.
  generateInvoice: (payload) =>
    request('/generate-invoice', { method: 'POST', body: payload }),

  invoiceUrl: (invoiceId) =>
    `${BASE}/invoice/${invoiceId}?token=${encodeURIComponent(auth.token)}`,
  invoiceImageUrl: (invoiceId) =>
    `${BASE}/invoice/${invoiceId}/image?token=${encodeURIComponent(auth.token)}`,
  async invoiceImageBlob(invoiceId) {
    const res = await fetch(api.invoiceImageUrl(invoiceId))
    if (!res.ok) throw new ApiError('image failed', res.status)
    return res.blob()
  },
}
