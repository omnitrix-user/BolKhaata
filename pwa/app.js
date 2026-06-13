// @ts-check
/* ===========================================================================
   BolKhaata — app logic (vanilla JS, JSDoc-typed; drop-in TS-ready).
   Offline-first: all state lives in localStorage. No backend required.
   Balance convention: positive = आने हैं (you receive), negative = देने हैं.
   =========================================================================== */

/**
 * @typedef {Object} Txn
 * @property {string} id
 * @property {'credit'|'debit'} type   credit = udhaar given (+), debit = payment received (−)
 * @property {number} amount
 * @property {number} at                epoch ms
 *
 * @typedef {Object} Customer
 * @property {string} id
 * @property {string} name
 * @property {Txn[]} txns
 */

const STORE_KEY = 'bolkhaata.v1';

/* --------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* --------------------------------------------------------------------------- */

/** @returns {Customer[]} */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt state */ }
  return seed();
}

/** @param {Customer[]} data */
function save(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

/** Demo data so the ledger looks alive on first launch. @returns {Customer[]} */
function seed() {
  const now = Date.now();
  const h = 3600_000;
  /** @type {Customer[]} */
  const data = [
    { id: cid(), name: 'रमेश अग्रवाल', txns: [{ id: cid(), type: 'credit', amount: 5400, at: now - 2 * h }] },
    { id: cid(), name: 'सुनीता देवी', txns: [{ id: cid(), type: 'debit', amount: 2100, at: now - 5 * h }] },
    { id: cid(), name: 'Imran Khan', txns: [{ id: cid(), type: 'credit', amount: 12800, at: now - 26 * h }] },
    { id: cid(), name: 'लक्ष्मी स्टोर्स', txns: [{ id: cid(), type: 'credit', amount: 8600, at: now - 50 * h }] },
    { id: cid(), name: 'अब्दुल भाई', txns: [{ id: cid(), type: 'debit', amount: 1500, at: now - 73 * h }] },
  ];
  save(data);
  return data;
}

/** @returns {string} */
function cid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* --------------------------------------------------------------------------- */
/* Calculations / state derivation                                             */
/* --------------------------------------------------------------------------- */

/** Signed balance for a customer. @param {Customer} c @returns {number} */
function balanceOf(c) {
  return c.txns.reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0);
}

/** @param {Customer} c @returns {number} most recent txn epoch */
function lastAt(c) {
  return c.txns.reduce((m, t) => Math.max(m, t.at), 0);
}

/** Aggregate totals for the hero card. @param {Customer[]} data */
function totals(data) {
  let receivable = 0, payable = 0;
  for (const c of data) {
    const b = balanceOf(c);
    if (b > 0) receivable += b;
    else if (b < 0) payable += -b;
  }
  return { receivable, payable, total: receivable + payable };
}

/* --------------------------------------------------------------------------- */
/* Formatting helpers                                                          */
/* --------------------------------------------------------------------------- */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** @param {number} n @returns {string} */
function rupee(n) { return '₹' + inr.format(Math.round(n)); }

/** Signed rupee with explicit minus for debit. @param {number} n */
function signedRupee(n) {
  return (n < 0 ? '-' : '') + '₹' + inr.format(Math.abs(Math.round(n)));
}

/** Relative "x hrs ago" microcopy. @param {number} at */
function ago(at) {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return 'अभी / now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

/** @param {string} name @returns {string} initial glyph for the avatar */
function initial(name) {
  const ch = (name.trim()[0] || '?');
  return ch.toUpperCase();
}

/** Escape user text before inserting into innerHTML. @param {string} s */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}

/* --------------------------------------------------------------------------- */
/* DOM references                                                              */
/* --------------------------------------------------------------------------- */

const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
const content = $('#content');
const live = $('#liveRegion');

let state = load();
let currentView = 'home';

/* --------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* --------------------------------------------------------------------------- */

function render() {
  if (currentView === 'home') return renderHome();
  if (currentView === 'customers') return renderCustomers();
  if (currentView === 'transactions') return renderTransactions();
  if (currentView === 'reports') return renderReports();
}

function renderHome() {
  const t = totals(state);
  const sorted = [...state].sort((a, b) => lastAt(b) - lastAt(a));

  content.innerHTML = `
    <section class="hero" aria-label="कुल बकाया सारांश">
      <p class="hero-sublabel">कुल बकाया (Total Balance)</p>
      <p class="hero-figure">${rupee(t.total)}</p>
      <div class="hero-split">
        <div class="pillar pillar--credit">
          <span class="pillar-label">आने हैं</span>
          <span class="pillar-value">${rupee(t.receivable)}</span>
        </div>
        <div class="pillar pillar--debit">
          <span class="pillar-label">देने हैं</span>
          <span class="pillar-value">${rupee(t.payable)}</span>
        </div>
      </div>
    </section>

    <section class="ledger" aria-label="हाल के ग्राहक">
      <div class="ledger-header">मेरे हाल के ग्राहक</div>
      <div class="ledger-list" id="ledgerList">
        ${sorted.length ? sorted.map(rowHTML).join('') :
          `<p class="empty-note">अभी कोई ग्राहक नहीं। नीचे + दबाकर पहला लेन-देन जोड़ें।<br/>No customers yet — tap + to add one.</p>`}
      </div>
    </section>`;
}

/** @param {Customer} c */
function rowHTML(c) {
  const b = balanceOf(c);
  const cls = b < 0 ? 'cust-amount--negative' : 'cust-amount--positive';
  return `
    <button class="cust-row" data-id="${c.id}" aria-label="${esc(c.name)}, ${signedRupee(b)}">
      <span class="cust-avatar" aria-hidden="true">${esc(initial(c.name))}</span>
      <span class="cust-main">
        <span class="cust-name">${esc(c.name)}</span>
        <span class="cust-time">${ago(lastAt(c))}</span>
      </span>
      <span class="cust-amount ${cls}">${signedRupee(b)}</span>
    </button>`;
}

function renderCustomers() {
  const sorted = [...state].sort((a, b) => a.name.localeCompare(b.name));
  content.innerHTML = panel('सभी ग्राहक / All Customers', `
    <div class="ledger-list" style="padding-top:4px">
      ${sorted.length ? sorted.map(rowHTML).join('') : emptyMsg()}
    </div>`);
}

function renderTransactions() {
  /** @type {{name:string,t:Txn}[]} */
  const all = [];
  for (const c of state) for (const t of c.txns) all.push({ name: c.name, t });
  all.sort((a, b) => b.t.at - a.t.at);
  content.innerHTML = panel('सभी लेन-देन / Transactions', `
    <div class="panel-body">
      ${all.length ? all.map(({ name, t }) => `
        <div class="txn-line">
          <span><strong>${esc(name)}</strong><br/><small>${ago(t.at)} · ${t.type === 'credit' ? 'उधार दिया' : 'भुगतान मिला'}</small></span>
          <span class="cust-amount ${t.type === 'credit' ? 'cust-amount--positive' : 'cust-amount--negative'}">
            ${t.type === 'credit' ? '' : '-'}${rupee(t.amount)}
          </span>
        </div>`).join('') : emptyMsg()}
    </div>`);
}

function renderReports() {
  const t = totals(state);
  const debtors = state.filter((c) => balanceOf(c) > 0).length;
  const creditors = state.filter((c) => balanceOf(c) < 0).length;
  content.innerHTML = panel('रिपोर्ट / Reports', `
    <div class="panel-body">
      <div class="stat-card">
        <h3>कुल आने हैं (Receivable)</h3>
        <div class="big cust-amount--positive">${rupee(t.receivable)}</div>
      </div>
      <div class="stat-card">
        <h3>कुल देने हैं (Payable)</h3>
        <div class="big cust-amount--negative">-${rupee(t.payable)}</div>
      </div>
      <div class="stat-card">
        <h3>ग्राहक (Customers)</h3>
        <div class="big">${state.length} <small style="font-size:13px;color:var(--charcoal-soft)">· ${debtors} आने · ${creditors} देने</small></div>
      </div>
    </div>`);
}

/** @param {string} title @param {string} inner */
function panel(title, inner) {
  return `<section class="panel" aria-label="${esc(title)}">
    <div class="ledger-header">${esc(title)}</div>${inner}</section>`;
}
function emptyMsg() {
  return `<p class="empty-note">कोई डेटा नहीं / No data yet.</p>`;
}

/* --------------------------------------------------------------------------- */
/* Add-transaction sheet                                                       */
/* --------------------------------------------------------------------------- */

const backdrop = $('#sheetBackdrop');
const fName = /** @type {HTMLInputElement} */ ($('#fName'));
const fAmount = /** @type {HTMLInputElement} */ ($('#fAmount'));
const optCredit = $('#optCredit');
const optDebit = $('#optDebit');
const voiceHint = $('#voiceHint');
let sheetType = /** @type {'credit'|'debit'} */ ('credit');

function setType(/** @type {'credit'|'debit'} */ type) {
  sheetType = type;
  optCredit.classList.toggle('type-opt--on', type === 'credit');
  optDebit.classList.toggle('type-opt--on', type === 'debit');
  optCredit.setAttribute('aria-checked', String(type === 'credit'));
  optDebit.setAttribute('aria-checked', String(type === 'debit'));
}

function openSheet(prefill = '') {
  fName.value = prefill;
  fAmount.value = '';
  setType('credit');
  voiceHint.hidden = true;
  backdrop.hidden = false;
  setTimeout(() => fName.focus(), 50);
}
function closeSheet() { backdrop.hidden = true; }

function saveSheet() {
  const name = fName.value.trim();
  const amount = parseFloat(fAmount.value);
  if (!name) { announce('ग्राहक का नाम डालें / Enter a name'); fName.focus(); return; }
  if (!(amount > 0)) { announce('सही रकम डालें / Enter a valid amount'); fAmount.focus(); return; }

  let cust = state.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!cust) { cust = { id: cid(), name, txns: [] }; state.push(cust); }
  cust.txns.push({ id: cid(), type: sheetType, amount, at: Date.now() });

  save(state);
  closeSheet();
  render();
  announce(`${name}: ${sheetType === 'credit' ? 'आने हैं' : 'देने हैं'} ${rupee(amount)} सेव हो गया`);
}

/* --------------------------------------------------------------------------- */
/* Voice entry (Web Speech API) — hands-free for fast-moving vendors           */
/* --------------------------------------------------------------------------- */

const SR = /** @type {any} */ (window).webkitSpeechRecognition || /** @type {any} */ (window).SpeechRecognition;
const voiceFab = $('#voiceFab');
let recognizer = null;
let listening = false;

function startVoice() {
  if (!SR) {
    openSheet();
    voiceHint.hidden = false;
    voiceHint.textContent = 'इस ब्राउज़र में आवाज़ उपलब्ध नहीं — हाथ से भरें / Voice not supported here.';
    return;
  }
  if (listening) { try { recognizer.stop(); } catch { /* noop */ } return; }

  recognizer = new SR();
  recognizer.lang = 'hi-IN';
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  recognizer.onstart = () => { listening = true; voiceFab.classList.add('is-listening'); announce('सुन रहे हैं… / Listening'); };
  recognizer.onerror = () => { announce('आवाज़ नहीं समझ आई / Voice error'); };
  recognizer.onend = () => { listening = false; voiceFab.classList.remove('is-listening'); };
  recognizer.onresult = (/** @type {any} */ e) => {
    const text = e.results[0][0].transcript || '';
    handleTranscript(text);
  };

  try { recognizer.start(); } catch { listening = false; voiceFab.classList.remove('is-listening'); }
}

/**
 * Best-effort parse: pull a number as the amount and use the rest as the name.
 * @param {string} text
 */
function handleTranscript(text) {
  const numMatch = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
  const amount = numMatch ? numMatch[0] : '';
  const name = text.replace(/\d+(\.\d+)?/g, '').replace(/\b(rupaye|rupees|रुपये|रुपए|udhaar|उधार)\b/gi, '').trim();

  openSheet(name);
  if (amount) fAmount.value = amount;
  // "paid / diya / मिला / चुकाया" → payment received (debit)
  if (/\b(diya|paid|chukaya|मिला|चुकाया|दिया)\b/i.test(text)) setType('debit');
  voiceHint.hidden = false;
  voiceHint.textContent = `🎤 "${text}" — जाँच कर सेव करें / verify & save`;
}

/* --------------------------------------------------------------------------- */
/* Misc                                                                        */
/* --------------------------------------------------------------------------- */

function announce(/** @type {string} */ msg) { live.textContent = msg; }

function switchView(/** @type {string} */ view, /** @type {HTMLElement} */ tabEl) {
  currentView = view;
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.remove('tab--active');
    el.removeAttribute('aria-current');
  });
  tabEl.classList.add('tab--active');
  tabEl.setAttribute('aria-current', 'page');
  content.scrollTop = 0;
  render();
}

/* --------------------------------------------------------------------------- */
/* Event wiring                                                                */
/* --------------------------------------------------------------------------- */

$('#addFab').addEventListener('click', () => openSheet());
voiceFab.addEventListener('click', startVoice);
$('#sheetCancel').addEventListener('click', closeSheet);
$('#sheetSave').addEventListener('click', saveSheet);
optCredit.addEventListener('click', () => setType('credit'));
optDebit.addEventListener('click', () => setType('debit'));
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });

$('#menuBtn').addEventListener('click', () => announce('मेन्यू / Menu (coming soon)'));
$('#profileBtn').addEventListener('click', () => announce('प्रोफ़ाइल / Profile (coming soon)'));

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchView(/** @type {string} */ (tab.getAttribute('data-view')), /** @type {HTMLElement} */ (tab)));
});

// Delegated customer-row taps (rows are re-rendered)
content.addEventListener('click', (e) => {
  const row = /** @type {HTMLElement} */ (e.target).closest('.cust-row');
  if (!row) return;
  const c = state.find((x) => x.id === row.getAttribute('data-id'));
  if (c) { openSheet(c.name); }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) closeSheet(); });

// First paint
render();

// Service worker for offline app-shell caching (no-op on file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache optional */ });
  });
}
